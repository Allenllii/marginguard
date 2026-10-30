import { z } from 'zod';

// These adapters are pure data boundaries. They do not call providers, authenticate
// packets, modify simulator input, confirm seller assumptions, or touch checkout.
const directives = /ignore.{0,40}(?:instructions?|previous)|system\s+prompt|execute.{0,20}(?:code|command)|send.{0,30}(?:secret|credential)|you are (?:chatgpt|an assistant)/iu;
const text = (maximum: number, minimum = 0) => z.string().min(minimum).max(maximum)
  .refine(value => !/[<>`\p{Cc}\p{Cf}]/u.test(value) && !directives.test(value), 'Unsafe reference text');
const SourceId = z.string().regex(/^S[1-3]$/u);
const RuleId = z.string().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/u)
  .refine(value => !['__proto__', 'prototype', 'constructor'].includes(value), 'Reserved rule ID');
const Origin = z.enum(['native', 'manual', 'scripts-api', 'app', 'app-script', 'unknown']);
const Region = z.enum(['US', 'UK', 'unknown']);
const Platform = z.enum(['Shopify', 'WooCommerce']);
const Scope = z.object({ platform: Platform, region: Region, discountOrigin: Origin }).strict();
const timestamp = z.string().max(40).refine(value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value) && Number.isFinite(Date.parse(value)), 'Invalid timestamp');
const nonnegative = z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER);
const nullableId = text(256).nullable();
const Packet = z.object({
  researchId: z.string().max(160).regex(/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|fixture-v1:(?:discount|shipping):(?:Shopify|WooCommerce):(?:USPS|UPS):(?:US|UK|unknown):(?:native|manual|scripts-api|app|app-script|unknown))$/iu),
  kind: z.enum(['discount', 'shipping', 'returns']),
  context: z.object({ platform: Platform, carrier: z.enum(['USPS', 'UPS']), region: Region, discountOrigin: Origin.optional() }).strict(),
  mode: z.enum(['fixture', 'live']), query: text(400), checkedAt: timestamp.nullable(),
  sources: z.array(z.object({
    id: SourceId, title: text(180, 1), url: z.string().max(2048), snippet: text(1200, 1),
    publishedDate: text(40).nullable(), savedAt: timestamp.optional(), sourceRegion: z.enum(['US', 'UK', 'global', 'other']).optional(),
  }).strict()).max(3),
  status: z.enum(['ok', 'no-results', 'error']), note: text(1200),
  retryAfterSeconds: z.number().int().min(0).max(3600).optional(),
  proof: z.object({ requestId: nullableId, latencyMs: nonnegative, usageCredits: nonnegative.nullable() }).strict().optional(),
  // Provenance only (shared/types.ts ResearchPacket); never projected into references.
  retrieval: z.object({ steps: z.array(z.object({ op: z.enum(['search', 'extract']), url: z.string().max(2048).optional(), requestId: text(256).optional(), credits: nonnegative.optional(), latencyMs: nonnegative.optional(), ok: z.boolean(), detail: text(200).optional() }).strict()).max(6) }).strict().optional(),
  policyChanged: z.object({ url: z.string().max(2048), reviewedAt: text(40) }).strict().optional(),
}).strict();

export interface PreflightPolicyReference {
  sourceId: string;
  title: string;
  url: string;
  scope: 'reference-only';
}
export interface PreflightPolicyProjection {
  packetReference: string;
  mode: 'fixture' | 'live';
  provenance: 'caller-supplied-packet';
  reportedCheckedAt: string | null;
  status: 'HOLD';
  checkoutVerified: false;
  sourceReferences: PreflightPolicyReference[];
  holdReasons: string[];
}

const distinct = (values: string[], label: string, caseInsensitive = false) => {
  if (new Set(caseInsensitive ? values.map(value => value.toLowerCase()) : values).size !== values.length) throw new Error(`Duplicate ${label}`);
};
const boundedArray = (raw: unknown, key: string, maximum: number) => {
  if (raw && typeof raw === 'object') {
    const value = (raw as Record<string, unknown>)[key];
    if (Array.isArray(value) && value.length > maximum) throw new Error(`${key} exceeds the adapter budget`);
    if (Array.isArray(value)) for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new Error(`${key} must be a dense array`);
    }
  }
};

/**
 * Project the existing policy packet into a reference preview. Even a live packet
 * describes a search observation, not a controlled test of this promotion. No
 * packet text becomes an engine evidence attestation or a checkout assertion.
 */
export function projectPreflightPolicyPacket(raw: unknown, requestedScope: unknown): PreflightPolicyProjection {
  boundedArray(raw, 'sources', 3);
  const packet = Packet.parse(raw);
  const requested = Scope.parse(requestedScope);
  distinct(packet.sources.map(source => source.id), 'source IDs');
  const urls = packet.sources.map(source => {
    let url: URL;
    try { url = new URL(source.url); } catch { throw new Error('Invalid source URL'); }
    const domains = packet.kind === 'shipping'
      ? packet.context.carrier === 'USPS' ? ['usps.com', 'www.usps.com'] : ['ups.com', 'www.ups.com']
      : packet.context.platform === 'Shopify' ? ['help.shopify.com'] : ['woocommerce.com'];
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !domains.includes(url.hostname)) throw new Error('Unsafe or mismatched official reference URL');
    // Fragments are not separate evidence. Normalize before duplicate detection.
    url.hash = '';
    return url.href;
  });
  distinct(urls, 'source URLs');

  const holdReasons = ['A policy reference does not establish this promotion\'s combination eligibility, execution order, or current checkout behavior.'];
  if (packet.mode === 'fixture') holdReasons.push('This packet contains offline fixture references, not current retrieved policy evidence.');
  if (packet.kind !== 'discount') holdReasons.push('This packet does not address discount combination applicability.');
  if (packet.status !== 'ok' || !packet.sources.length) holdReasons.push('No usable source references are available in this packet.');
  if (packet.mode === 'live' && packet.checkedAt === null) holdReasons.push('The packet does not report a retrieval time; current-policy evidence is incomplete.');
  if (requested.platform !== packet.context.platform || requested.region !== packet.context.region || requested.discountOrigin !== (packet.context.discountOrigin ?? 'unknown')) holdReasons.push('The requested activity scope does not match the packet context.');
  if (requested.region !== 'US' || packet.context.region !== 'US' || packet.sources.some(source => source.sourceRegion === 'UK' || source.sourceRegion === 'other')) holdReasons.push('Region applicability is unknown, mismatched, or outside the supported reference scope.');
  if (requested.discountOrigin !== 'native') holdReasons.push('Manual, script, app, or unknown discount origin requires its own explicit combination and execution-order checks.');

  return {
    packetReference: packet.researchId, mode: packet.mode, provenance: 'caller-supplied-packet', reportedCheckedAt: packet.checkedAt,
    status: 'HOLD', checkoutVerified: false,
    sourceReferences: packet.sources.map((source, index) => ({ sourceId: source.id, title: source.title, url: urls[index], scope: 'reference-only' })),
    holdReasons,
  };
}

const Proposal = z.object({
  omitRuleIds: z.array(RuleId).min(1).max(3),
  sourceIds: z.array(SourceId).max(3),
  rationale: text(600, 20).refine(value => !/[\d$%]|https?:|\b(?:guaranteed?|definitely|checkout verified|actual savings|launch immediately|guaranteed profitable)\b/iu.test(value), 'Unsupported proposal claim'),
}).strict();
const ProposalContext = z.object({ ruleIds: z.array(RuleId).max(3), sourceIds: z.array(SourceId).max(3) }).strict();

export interface ReviewedPreflightProposal {
  mode: 'offline-proposal';
  model: null;
  omitRuleIds: string[];
  sourceIds: string[];
  rationale: string;
  requiresSellerReview: true;
  applyAutomatically: false;
  limitations: string[];
}

/**
 * Validate a small candidate from a fixture or future provider adapter. The only
 * permitted action is a proposed omission of existing simulator rules. Returning
 * data does not apply it; the UI must show it for an explicit seller decision.
 * Reference membership is checked; semantic support is deliberately not claimed.
 */
export function parsePreflightProposal(raw: unknown, allowedReferences: unknown): ReviewedPreflightProposal {
  for (const key of ['omitRuleIds', 'sourceIds']) boundedArray(raw, key, 3);
  for (const key of ['ruleIds', 'sourceIds']) boundedArray(allowedReferences, key, 3);
  const value = Proposal.parse(raw), allowed = ProposalContext.parse(allowedReferences);
  distinct(allowed.ruleIds, 'allowed rule IDs', true); distinct(allowed.sourceIds, 'allowed source IDs');
  distinct(value.omitRuleIds, 'proposed rule IDs', true); distinct(value.sourceIds, 'proposed source IDs');
  if (value.omitRuleIds.some(id => !allowed.ruleIds.includes(id)) || value.sourceIds.some(id => !allowed.sourceIds.includes(id))) throw new Error('Unknown proposal reference');
  return {
    ...value, mode: 'offline-proposal', model: null, requiresSellerReview: true, applyAutomatically: false,
    limitations: [
      'This candidate is not evidence of policy applicability, promotion eligibility, or a profitable launch.',
      'This adapter makes no model request; provider provenance and semantic fidelity are not authenticated.',
      'A seller must review any candidate and explicitly edit the simulation before rerunning it.',
    ],
  };
}
