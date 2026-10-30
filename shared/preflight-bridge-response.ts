import { z } from 'zod';
import { PREFLIGHT_FIXTURE, validatePreflightInput } from './preflight.js';
import { PolicyReviewDossierSchema } from './policy-review-dossier.js';

export const PREFLIGHT_POLICY_URL = 'https://help.shopify.com/en/manual/discounts/discount-combinations';
/** Campaign conditions the integer simulator does not model. Reported, never simulated. */
export const UNMODELED_CONDITIONS = ['customer_segment', 'date_window', 'product_subset', 'usage_limit', 'discount_code', 'other'] as const;
export const SYNTHETIC_CAMPAIGN = '20% product discount then 20% order discount then free shipping';
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
