import { z } from 'zod';
import { PREFLIGHT_FIXTURE, validatePreflightInput, type PreflightRule } from './preflight.js';
import { PolicyReviewDossierSchema } from './policy-review-dossier.js';

export const PREFLIGHT_POLICY_URL = 'https://help.shopify.com/en/manual/discounts/discount-combinations';
/** Campaign conditions the integer simulator does not model. Reported, never simulated. */
export const UNMODELED_CONDITIONS = ['customer_segment', 'date_window', 'product_subset', 'usage_limit', 'discount_code', 'other'] as const;
export const SYNTHETIC_CAMPAIGN = '20% product discount then 20% order discount then free shipping';
export type UnmodeledCondition = typeof UNMODELED_CONDITIONS[number];
/** `grammar_confirmed`: the local parser read the same rules. `nemotron_interpreted`: only the model could read it. */
export type IntentInterpretation = 'grammar_confirmed' | 'nemotron_interpreted';

// Key-order-independent equality for plain JSON rule objects (Workers have no node:util).
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);

/**
 * Deterministic cross-check grammar: one to three product/order percentage
 * discounts or free shipping, separated by then/and/commas. Returns null when the
 * text is outside the grammar; free-form campaigns are then model-interpreted.
 */
export function parseCampaignGrammar(text: string): PreflightRule[] | null {
  const clauses = text.toLowerCase().split(/\s+(?:and then|then|and)\s+|,\s*/);
  if (clauses.length > 3 || clauses.some(clause => !clause)) return null;
  const rules: PreflightRule[] = [];
  for (const clause of clauses) {
    const clean = clause.trim().replace(/^(?:apply|offer) (?:a )?/, '');
    const id = `R${rules.length + 1}`;
    if (clean === 'free shipping') { rules.push({ id, type: 'free_shipping', minSubtotalCents: 0, minItems: 0 }); continue; }
    const direct = clean.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent) (product|order) discount$/);
    const on = clean.match(/^(\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent) discount on (products?|order)$/);
    const of = clean.match(/^(product|order) discount of (\d{1,3}(?:\.\d{1,2})?)\s*(?:%|percent)$/);
    const literal = direct?.[1] ?? on?.[1] ?? of?.[2];
    const scope = (direct?.[2] ?? on?.[2] ?? of?.[1])?.replace(/s$/, '');
    if (literal === undefined || (scope !== 'product' && scope !== 'order') || /^0\d/.test(literal)) return null;
    const basisPoints = hundredths(literal);
    if (basisPoints < 1 || basisPoints > 10000) return null;
    rules.push({ id, type: 'percent', scope, basisPoints, minSubtotalCents: 0, minItems: 0 });
  }
  return rules;
}

/** Integer hundredths of a decimal literal, never via floating point: "37.25" -> 3725. */
function hundredths(literal: string): number {
  const [whole, fraction = ''] = literal.replace(/,/g, '').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

// Strict, bounded model contract. No ids, totals, savings or prose: any extra
// field fails `.strict()`. Values are integers inside the engine's ranges.
const Thresholds = { minSubtotalCents: z.number().int().min(0).max(9_000_000), minItems: z.number().int().min(0).max(9) };
const ModelRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('percent'), scope: z.enum(['product', 'order']), basisPoints: z.number().int().min(1).max(10000), ...Thresholds }).strict(),
  z.object({ type: z.literal('fixed'), amountCents: z.number().int().min(1).max(1_000_000), ...Thresholds }).strict(),
  z.object({ type: z.literal('free_shipping'), ...Thresholds }).strict(),
]);
const IntentSchema = z.object({ rules: z.array(ModelRule).max(3), unmodeled: z.array(z.enum(UNMODELED_CONDITIONS)).max(UNMODELED_CONDITIONS.length) }).strict();
const UNVALIDATED = 'The model request failed or its output could not be validated. No rule was applied and no automatic retry was made.';
export type InterpretationCheck =
  | { ok: true; rules: PreflightRule[]; unmodeledConditions: UnmodeledCondition[]; interpretation: IntentInterpretation; reason: string }
  | { ok: false; code: string; reason: string };
/**
 * The gate every Nemotron interpretation passes, live or replayed offline: the strict
 * zod contract, the engine validator, grounding (every non-zero value is a number the
 * seller wrote) and the local grammar cross-check. `text` must already be screened.
 */
export function checkInterpretation(text: string, output: unknown): InterpretationCheck {
  const parsed = IntentSchema.safeParse(output);
  if (!parsed.success) return { ok: false, code: 'MODEL_RULE_SCHEMA_INVALID', reason: UNVALIDATED };
  if (!parsed.data.rules.length) return { ok: false, code: 'MODEL_NO_RULES', reason: 'Nemotron found no rule the simulator can represent. Rephrase the campaign or author rules in the local simulator.' };
  // Engine validator: duplicate semantics, ranges, allowlisted fields.
  let rules: PreflightRule[];
  try { rules = validatePreflightInput({ ...PREFLIGHT_FIXTURE, rules: parsed.data.rules.map((rule, index) => ({ id: `R${index + 1}`, ...rule })) }).rules; }
  catch { return { ok: false, code: 'MODEL_RULE_VALIDATION_FAILED', reason: UNVALIDATED }; }
  // Grounding: every non-zero value must be exactly a number the seller wrote
  // (in hundredths: 20% -> 2000 bp, $75 -> 7500 cents, 2 items -> 200).
  const literals = new Set((text.match(/\d[\d,]*(?:\.\d{1,2})?/g) ?? []).map(hundredths));
  const values = rules.flatMap(rule => [rule.minSubtotalCents, rule.minItems * 100, rule.type === 'percent' ? rule.basisPoints : rule.type === 'fixed' ? rule.amountCents : 0]);
  if (values.some(value => value !== 0 && !literals.has(value))) return { ok: false, code: 'MODEL_VALUE_UNGROUNDED', reason: 'Nemotron proposed a value that does not appear in the campaign text. No rule was applied.' };
  const grammar = parseCampaignGrammar(text);
  if (grammar && canonical(grammar) !== canonical(rules)) return { ok: false, code: 'MODEL_GRAMMAR_MISMATCH', reason: 'Nemotron\'s interpretation differs from the local parser\'s reading of this campaign. No rule was applied; rephrase the campaign or author the rules in the local simulator.' };
  const unmodeledConditions = [...new Set(parsed.data.unmodeled)];
  const conditions = unmodeledConditions.length ? ` Conditions not simulated: ${unmodeledConditions.join(', ')}.` : '';
  return {
    ok: true, rules, unmodeledConditions, interpretation: grammar ? 'grammar_confirmed' : 'nemotron_interpreted',
    reason: (grammar ? 'Nemotron and the local parser agree on these rules.' : 'Interpreted by Nemotron — review before simulating. The local parser could not read this free-form campaign.')
      + conditions + ' Explicitly confirm the proposed simulation rules. No store or checkout was changed; money is calculated only by the integer engine.',
  };
}

/**
 * One real Nemotron 3 Super run, copied from evidence/live-intent-20261030.json step 1
 * (tests/preflight-recorded-replay.test.ts keeps them equal). The offline page replays
 * it through `checkInterpretation`; it is a recording, never a live result or proof.
 */
export const RECORDED_INTERPRETATION = {
  campaign: '20% off sitewide plus an extra $10 off orders over $75 for VIPs, stackable with free shipping',
  model: 'nvidia/nemotron-3-super-120b-a12b', requestId: 'chatcmpl-8ae1c087d8a60974', recordedOn: '2026-10-30',
  rules: [
    { id: 'R1', minSubtotalCents: 0, minItems: 0, type: 'percent', scope: 'product', basisPoints: 2000 },
    { id: 'R2', minSubtotalCents: 7500, minItems: 0, type: 'fixed', amountCents: 1000 },
    { id: 'R3', minSubtotalCents: 0, minItems: 0, type: 'free_shipping' },
  ] as PreflightRule[],
  unmodeledConditions: ['customer_segment'] as UnmodeledCondition[],
} as const;
/** The recorded rules in the model's own output shape (no ids), for the shared gate. */
export const recordedModelOutput = () => ({ rules: RECORDED_INTERPRETATION.rules.map(({ id: _id, ...rule }) => rule), unmodeled: [...RECORDED_INTERPRETATION.unmodeledConditions] });

const unsafe = /<[^>]+>|ignore.{0,60}(?:instructions?|previous)|system\s+prompt|api[\s_-]*key|execute.{0,30}(?:code|command)/iu;
const Text = z.string().min(1).max(1200).refine(value => !unsafe.test(value), 'Unsupported response prose');
const Trace = z.object({ endpoint: z.enum(['search', 'extract', 'models', 'completion']), provider: z.enum(['tavily', 'nebius']), outcome: z.enum(['in-flight', 'response', 'unknown']), status: z.number().int().min(100).max(599).nullable() }).strict();
const Reply = z.object({
  mode: z.enum(['fixture', 'live']), status: z.enum(['HOLD', 'NEEDS_CONFIRMATION']), reason: Text,
  rules: z.array(z.unknown()).max(3), model: z.string().max(256).nullable(),
  // Additive and optional so older servers and UI mocks still parse.
  interpretation: z.enum(['grammar_confirmed', 'nemotron_interpreted']).nullable().optional(),
  unmodeledConditions: z.array(z.enum(UNMODELED_CONDITIONS)).max(UNMODELED_CONDITIONS.length).optional(),
  policy: z.object({ mode: z.enum(['fixture', 'live']), status: z.enum(['HOLD', 'REFERENCE_READY']), reason: Text,
    sources: z.array(z.object({ id: z.literal('S1'), title: Text, url: z.literal(PREFLIGHT_POLICY_URL), snippet: Text }).strict()).max(1),
    reviewEvidence: PolicyReviewDossierSchema.optional(),
  }).strict().nullable(),
  requiresSellerConfirmation: z.literal(true), applyAutomatically: z.literal(false), checkoutVerified: z.literal(false),
  http: z.object({ maximumAttempts: z.literal(4), attempted: z.number().int().min(0).max(4), blocked: z.boolean(), unknownOutcomes: z.number().int().min(0).max(4), traces: z.array(Trace).max(4) }).strict(),
  proposalId: z.string().uuid().nullable(), proposalTtlSeconds: z.literal(600).nullable(),
}).strict();

export function parsePreflightBridgeReply(value: unknown) {
  const reply = Reply.parse(value), trace = reply.http;
  if (reply.policy?.reviewEvidence) {
    if (reply.mode !== 'live' || reply.policy.mode !== 'live' || reply.status !== 'HOLD' || reply.policy.status !== 'HOLD' || reply.policy.sources.length || reply.model !== null || trace.attempted !== 2 || trace.unknownOutcomes || trace.blocked) throw Error('Unreviewed evidence cannot authorize a proposal');
    if (trace.traces.some((item, index) => item.endpoint !== ['search', 'extract'][index] || item.provider !== 'tavily' || item.outcome !== 'response' || !item.status || item.status < 200 || item.status >= 300)) throw Error('Unproven review evidence retrieval');
  }
  if (trace.attempted !== trace.traces.length || trace.unknownOutcomes !== trace.traces.filter(item => item.outcome === 'unknown').length) throw Error('Inconsistent attempt report');
  const rules = validatePreflightInput({ ...PREFLIGHT_FIXTURE, rules: reply.rules }).rules;
  if (reply.status === 'NEEDS_CONFIRMATION') {
    if (reply.mode !== 'live' || !reply.model?.startsWith('nvidia/') || !reply.proposalId || reply.proposalTtlSeconds !== 600 || !rules.length || reply.policy?.mode !== 'live' || reply.policy.status !== 'REFERENCE_READY' || !reply.policy.sources.length || trace.blocked || trace.attempted !== 4 || trace.unknownOutcomes) throw Error('Unproven live proposal');
    const endpoints = ['search', 'extract', 'models', 'completion'];
    if (trace.traces.some((item, index) => item.endpoint !== endpoints[index] || item.provider !== (index < 2 ? 'tavily' : 'nebius') || item.outcome !== 'response' || !item.status || item.status < 200 || item.status >= 300)) throw Error('Unproven live stages');
  } else if (rules.length || reply.proposalId || reply.interpretation || reply.unmodeledConditions?.length) throw Error('Held response cannot supply a proposal');
  return { ...reply, rules };
}
export type PreflightBridgeReply = ReturnType<typeof parsePreflightBridgeReply>;
export function safeBridgeMessage(value: unknown, fallback: string) { const result = Text.safeParse(value); return result.success ? result.data : fallback; }
