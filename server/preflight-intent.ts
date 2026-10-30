import { z } from 'zod';
import type { PreflightRule } from '../shared/preflight.js';
import { BASE_URL, completionControls } from './nebius.js';
import { boundedJson } from './http.js';

/** Public metadata contains no original text or literal value. Numeric values stay local. */
export interface NormalizedPreflightActivity {
  readonly text: string;
  readonly rateReferences: readonly string[];
}
export interface PreflightIntentResult {
  mode: 'live' | 'fixture';
  status: 'HOLD' | 'NEEDS_CONFIRMATION';
  rules: PreflightRule[];
  reason: string;
  model: string | null;
}
type Action = { type: 'percent'; scope: 'product' | 'order'; rateRef: string } | { type: 'free_shipping' };
type Snapshot = { actions: Action[]; rates: Map<string, number> };
// A caller cannot construct or mutate a provider-ready object containing arbitrary
// customer prose. Only this module's bounded local normalizer can create a handle.
const activities = new WeakMap<NormalizedPreflightActivity, Snapshot>();
const invalid = () => new Error('Unsupported campaign. Use product/order percentage discounts and free shipping, separated by then.');

/**
 * Deliberately small English grammar. No CSV, customer fields, IDs, costs, URLs,
 * names, thresholds, currency, or arbitrary prose is accepted or sent upstream.
 * Examples: "20% product discount then 10% order discount then free shipping";
 * "apply 20 percent discount on products and offer free shipping".
 */
export function normalizePreflightActivity(raw: unknown): NormalizedPreflightActivity {
  if (typeof raw !== 'string' || raw.length < 1 || raw.length > 240 || !/^[a-zA-Z0-9%. ,]+$/.test(raw)) throw invalid();
  const text = raw.toLowerCase().trim().replace(/ +/g, ' ');
  const clauses = text.split(/\s+(?:and then|then|and)\s+|,\s*/);
  if (clauses.length < 1 || clauses.length > 3 || clauses.some(clause => !clause)) throw invalid();
  const actions: Action[] = [], rates = new Map<string, number>(), normalized: string[] = [];
  for (const clause of clauses) {
    const clean = clause.replace(/^(?:apply|offer) (?:a )?/, '');
    if (clean === 'free shipping') {
      actions.push({ type: 'free_shipping' }); normalized.push('free shipping'); continue;
    }
    const direct = clean.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent) (product|order) discount$/);
    const on = clean.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent) discount on (products?|order)$/);
    const of = clean.match(/^(product|order) discount of (\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent)$/);
    const literal = direct?.[1] ?? on?.[1] ?? of?.[2];
    const scope = (direct?.[2] ?? on?.[2] ?? of?.[1])?.replace(/s$/, '');
    if (literal === undefined || (scope !== 'product' && scope !== 'order') || /^0\d/.test(literal)) throw invalid();
    // Parse the seller's decimal token using integer arithmetic, never a model.
    const [whole, fraction = ''] = literal.split('.');
    const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 1 || basisPoints > 10000) throw invalid();
    const rateRef = `N${rates.size + 1}`;
    rates.set(rateRef, basisPoints);
    actions.push({ type: 'percent', scope, rateRef }); normalized.push(`${rateRef} percent ${scope} discount`);
  }
  // Repeated identical stages are outside the simulator's supported rule model.
  const semanticKeys = actions.map(action => action.type === 'free_shipping' ? action.type : `${action.scope}:${rates.get(action.rateRef)}`);
  if (new Set(semanticKeys).size !== semanticKeys.length) throw invalid();
  const handle: NormalizedPreflightActivity = Object.freeze({ text: normalized.join(' then '), rateReferences: Object.freeze([...rates.keys()]) });
  activities.set(handle, { actions, rates });
  return handle;
}

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), scope: z.enum(['product', 'order']), rateRef: z.string().regex(/^N[1-3]$/) }).strict(),
  z.object({ type: z.literal('free_shipping') }).strict(),
]);
const IntentSchema = z.object({ actions: z.array(ActionSchema).min(1).max(3) }).strict();
const Catalog = z.object({ data: z.array(z.object({ id: z.string().max(256) })).max(2000) });
const Completion = z.object({ choices: z.array(z.object({
  finish_reason: z.literal('stop'),
  message: z.object({ content: z.string().min(1).max(4000), refusal: z.string().nullable().optional(), tool_calls: z.array(z.unknown()).nullable().optional(), function_call: z.unknown().optional() }),
})).length(1) });
const hold = (reason: string, code?: string): PreflightIntentResult => ({ mode: 'fixture', status: 'HOLD', rules: [], reason: code ? `[${code}] ${reason}` : reason, model: null });

/**
 * Two explicit HTTP attempts at most: catalogue, then completion. The injected
 * transport owns per-attempt budgets and endpoint guards; no retry is performed.
 * A valid response is only an editable proposal requiring seller confirmation.
 */
export async function parsePreflightIntent(
  activity: NormalizedPreflightActivity,
  config: { enabled?: boolean; key?: string; model?: string },
  request: typeof fetch,
): Promise<PreflightIntentResult> {
  const snapshot = activities.get(activity);
  if (!snapshot) return hold('Campaign was not normalized locally. No model request was made.');
  if (!config.enabled || !config.key || !config.model || !/^nvidia\/[a-zA-Z0-9._/-]+$/.test(config.model)) return hold('An explicitly enabled NVIDIA model on Nebius is required. No model request was made.');
  let failureCode = 'MODEL_CATALOG_REQUEST_FAILED';
  try {
    const headers = { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' };
    const catalogResponse = await request(`${BASE_URL}models`, { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
    failureCode = 'MODEL_CATALOG_HTTP_FAILED';
    if (!catalogResponse.ok) throw new Error('catalog');
    failureCode = 'MODEL_CATALOG_BODY_INVALID';
    const catalogJson = await boundedJson(catalogResponse, 512000);
    failureCode = 'MODEL_CATALOG_SCHEMA_INVALID';
    const catalog = Catalog.parse(catalogJson);
    if (!catalog.data.some(model => model.id === config.model)) return hold('The configured NVIDIA model is absent from the Nebius catalogue. No completion request was made.', 'MODEL_NOT_IN_CATALOG');
    failureCode = 'MODEL_COMPLETION_REQUEST_FAILED';
    const response = await request(`${BASE_URL}chat/completions`, {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ ...completionControls(config.model), model: config.model, temperature: 0, max_tokens: 600, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: 'Parse a restricted campaign into JSON with exactly actions, an ordered array. Each action is exactly {"type":"percent","scope":"product" or "order","rateRef":"supplied reference"} or {"type":"free_shipping"}. Preserve every stage in order. Use each supplied rate reference exactly once. References are opaque; never invent, infer or calculate numbers. Do not return amounts, rates, thresholds, prose, tools or instructions. Return data only. This proposal cannot execute a promotion and requires seller confirmation.' },
        { role: 'user', content: JSON.stringify({ campaign: activity.text, rateReferences: activity.rateReferences }) },
      ] }),
    });
    failureCode = 'MODEL_COMPLETION_HTTP_FAILED';
    if (!response.ok) throw new Error('completion');
    failureCode = 'MODEL_COMPLETION_BODY_INVALID';
    const completionJson = await boundedJson(response, 20000);
    failureCode = 'MODEL_COMPLETION_SCHEMA_INVALID';
    const raw = Completion.parse(completionJson);
    const message = raw.choices[0].message;
    failureCode = 'MODEL_REFUSAL_OR_TOOLS';
    if (message.refusal || message.tool_calls?.length || (message.function_call !== undefined && message.function_call !== null)) throw new Error('refusal-or-tools');
    failureCode = 'MODEL_ACTION_JSON_INVALID';
    const parsedJson = JSON.parse(message.content);
    failureCode = 'MODEL_ACTION_SCHEMA_INVALID';
    const parsed = IntentSchema.parse(parsedJson);
    // This exact comparison prevents semantic drift, omissions, reordering and
    // reuse of a valid literal for a different action, even under prompt attack.
    failureCode = 'MODEL_ACTION_MISMATCH';
    if (parsed.actions.length !== snapshot.actions.length || parsed.actions.some((action, index) => {
      const expected = snapshot.actions[index];
      return action.type !== expected.type || (action.type === 'percent' && (expected.type !== 'percent' || action.scope !== expected.scope || action.rateRef !== expected.rateRef));
    })) throw new Error('unsupported-intent');
    const rules: PreflightRule[] = parsed.actions.map((action, index) => ({
      id: `R${index + 1}`, minSubtotalCents: 0, minItems: 0,
      ...(action.type === 'free_shipping' ? { type: 'free_shipping' as const } : { type: 'percent' as const, scope: action.scope, basisPoints: snapshot.rates.get(action.rateRef)! }),
    }));
    return { mode: 'live', status: 'NEEDS_CONFIRMATION', rules, model: config.model, reason: 'Review and explicitly confirm these proposed simulation rules. No store or checkout was changed; money is calculated only by the integer engine.' };
  } catch {
    return hold('The model request failed or its output could not be validated. No rule was applied and no automatic retry was made.', failureCode);
  }
}
