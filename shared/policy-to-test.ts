import { z } from 'zod';
import type { ResearchPacket } from './types.js';
import { incompatibleSourceRegion, unresolvedPolicyStatement } from './policy-source-scope.js';

export type PolicyTestAction = 'review-combination-settings' | 'audit-manual-overrides';
export type PolicyTestRule = 'native-combination' | 'manual-exception';
export interface PolicyTestEvidence { sourceId: string; url: string; quote: string; ruleId: PolicyTestRule; }
export interface PolicyTestCard {
  scenario: 'normal' | 'manual' | 'unknown';
  verdict: 'supported' | 'contradicted' | 'hold';
  reason: string; nextCheck: string; evidence: PolicyTestEvidence[]; missingEvidence: string[];
}
export interface PolicyTestSuite {
  action: PolicyTestAction; mode: 'fixture' | 'live'; status: 'ready' | 'hold';
  cards: PolicyTestCard[]; rejectedCandidates: number; notice: string;
}

// Candidates are proposals, never authority. No model-authored verdict, command,
// remediation prose, URL, or store data can cross this envelope.
export const PolicyTestCandidatesSchema = z.array(z.object({
  sourceId: z.string().regex(/^S[1-3]$/u),
  ruleId: z.enum(['native-combination', 'manual-exception']),
  quote: z.string().min(20).max(1200), limitation: z.literal('review-only'),
}).strict()).max(6);
export type PolicyTestCandidate = z.infer<typeof PolicyTestCandidatesSchema>[number];

const PacketSchema = z.object({
  kind: z.literal('discount'), mode: z.enum(['fixture', 'live']), status: z.literal('ok'),
  context: z.object({ platform: z.enum(['Shopify', 'WooCommerce']), region: z.literal('US') }),
  sources: z.array(z.object({
    id: z.string().regex(/^S[1-3]$/u), title: z.string().max(2000),
    url: z.string().max(2048), snippet: z.string().min(1).max(1200),
    sourceRegion: z.enum(['US', 'global']),
  })).min(1).max(3),
});
type ScreenedPacket = z.infer<typeof PacketSchema>;

const instructions = /ignore.{0,30}(?:instructions|previous)|system\s*prompt|api.?key|execute.{0,20}(?:code|command)|send.{0,20}(?:secret|credential)|you are (?:chatgpt|an assistant)|<[^>]+>|[\p{Cc}\p{Cf}]/iu;
const negative = /\b(?:not|cannot|can't|never|neither|false|untrue|incorrect|myth|no\s+exceptions?)\b/iu;
const unresolvedCondition = /\b(?:unless|only|except|eligible|provided|depending|subject\s+to|if|where|when|for)\b/iu;
const manualScope = /\bmanual\b.{0,100}\b(?:discounts?|overrides?)\b/iu;
const nativeScope = /\b(?:discount|coupon|combination)\b|\bdiscounts\b/iu;
// A later retraction or regional restriction must not be discarded when a
// candidate selects only an earlier affirmative sentence. This deliberately
// holds the whole packet rather than trying to resolve prose coreferences.
const retraction = /\b(?:sentence|statement|claim|source|exception|rule)\b.{0,120}\b(?:false|untrue|incorrect|outdated|retracted|hypothetical\s+example)\b/iu;
const incompatibleRegion = /\b(?:united\s+kingdom|UK\s+only|british\s+(?:stores|merchants|accounts))\b/iu;
// Title coverage is also closed: an unknown title can contain an unrecognized
// geographic or account qualifier even when a caller labels it "global".
const recognizedTitle = /^(?:Authored combination policy(?: UI)? fixture|Combining discounts(?:\s*[·—–|-]\s*Shopify Help Center)?|Coupon management\s*[·—–|-]\s*WooCommerce)$/iu;

function safeSourceUrl(raw: string, platform: ScreenedPacket['context']['platform']) {
  try {
    const url = new URL(raw);
    const domain = platform === 'Shopify' ? 'help.shopify.com' : 'woocommerce.com';
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && (url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

// A deliberately narrow, versioned sentence matcher, not semantic certification.
// Keep the complete sentence: a candidate cannot cut away a denial or condition.
function clauses(snippet: string): string[] {
  return (snippet.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? []).map(text => text.trim()).filter(Boolean);
}
function hasScope(text: string, rule: PolicyTestRule): boolean {
  if (rule === 'manual-exception') return manualScope.test(text) && /\bcombination settings\b/iu.test(text);
  return nativeScope.test(text) && !/\b(?:manual|POS|draft|Scripts|app)\b/iu.test(text);
}
function matchesRule(text: string, rule: PolicyTestRule, platform: ScreenedPacket['context']['platform']): boolean {
  if (!hasScope(text, rule) || negative.test(text) || /[!?]/u.test(text)) return false;
  const clause = text.replace(/^Saved-source paraphrase:\s*/iu, '').replace(/\.$/u, '').trim();
  if (rule === 'manual-exception') {
    const directManualPredicate = /^manual(?:\s+POS)?(?:\s*(?:\/|and)\s*draft[- ]orders?)?\s+discounts?\s+(?:(?:can\s+bypass|bypass(?:es)?)\s+combination\s+settings|apply\s+regardless\s+of\s+combination\s+settings)$/iu.test(clause);
    const enumeratedExceptions = /^Shopify\s+lists\s+manual\s+POS\/draft-order\s+discounts\s+and\s+Scripts\s+API\s+discounts\s+as\s+exceptions\s+that\s+apply\s+regardless\s+of\s+combination\s+settings$/iu.test(clause);
    return platform === 'Shopify' && !unresolvedCondition.test(text)
      && (directManualPredicate || enumeratedExceptions);
  }
  // This condition is intentionally an investigation prerequisite, not evidence
  // that a seller's store actually meets it. Other qualified clauses fail closed.
  const simplePermission = /^(?:eligible\s+)?(?:discount\s+classes|discounts|automatic\s+discounts|code\s+discounts)\s+(?:can|may)\s+(?:combine|be\s+combined)\s+when\s+(?:the\s+)?(?:relevant\s+)?settings\s+permit\s+it$/iu.test(clause);
  const wooRestriction = platform === 'WooCommerce' && /^coupon\s+usage\s+restrictions\s+include\s+individual.use\s+controls$/iu.test(clause);
  const rest = text.replace(/\bwhen\s+(?:the\s+)?(?:relevant\s+)?settings\s+permit\s+it\b/iu, '').replace(/\beligible\s+(?=discount\s+classes\b)/iu, '');
  return (simplePermission || wooRestriction) && !unresolvedCondition.test(rest);
}

function heldCards(reason: string): PolicyTestCard[] {
  return [
    { scenario: 'normal', verdict: 'hold', reason, nextCheck: 'Retrieve the applicable native discount combination clause; confirm store eligibility and the active code or automatic discount configuration.', evidence: [], missingEvidence: ['An operative native combination clause', 'Store eligibility, active configuration and policy effective date'] },
    { scenario: 'manual', verdict: 'hold', reason, nextCheck: 'Inspect the originating staff/manual POS or draft-order path and retrieve its applicable exception policy before proposing a settings remedy.', evidence: [], missingEvidence: ['An applicable manual exception clause', 'Override record, permissions, transaction scope and policy effective date'] },
    { scenario: 'unknown', verdict: 'hold', reason: 'The discount origin is unknown in this hypothetical scenario. Neither a citation nor a model candidate establishes its mechanism.', nextCheck: 'Identify the discount origin on a flagged order, then obtain the matching policy; hold any settings or override remedy until the mechanism is known.', evidence: [], missingEvidence: ['Seller-confirmed discount origin and application mechanism', 'Applicable policy and store eligibility'] },
  ];
}

/** Pure local check. Call only with the existing server-issued research packet.
 * Cards alter hypothetical origin only; sources are never refetched or expanded.
 * URL/clause screening cannot authenticate caller-supplied packet contents.
 */
export function buildPolicyTestSuite({ packet, action, candidates }: {
  packet: ResearchPacket; action: PolicyTestAction; candidates?: unknown;
}): PolicyTestSuite {
  const mode = packet?.mode === 'live' ? 'live' : 'fixture';
  const result: PolicyTestSuite = {
    action, mode, status: 'hold', rejectedCandidates: 0,
    notice: `${mode === 'fixture' ? 'Offline fixture: authored summaries; no provider call or current retrieval.' : 'Received live-mode packet; no new retrieval or model call. A failed or unusable packet supplies no matching evidence.'} Synthetic counterfactual scenarios, not tests executed against a real store. Source URL screening and narrow code rule matching do not prove semantic fidelity, eligibility, cause, effective date, or recovery.`,
    cards: heldCards('The packet does not provide a source-screened, applicable operative clause for this scenario. Hold the proposed action.'),
  };
  if (action !== 'review-combination-settings' && action !== 'audit-manual-overrides') return result;
  const parsed = PacketSchema.safeParse(packet);
  if (!parsed.success) return result;
  const p = parsed.data;
  if (new Set(p.sources.map(source => source.id)).size !== p.sources.length
    || p.sources.some(source => !safeSourceUrl(source.url, p.context.platform) || !recognizedTitle.test(source.title) || instructions.test(source.snippet) || instructions.test(source.title)
      || retraction.test(source.snippet) || incompatibleRegion.test(`${source.title} ${source.snippet}`)
      || incompatibleSourceRegion(source) || unresolvedPolicyStatement(source.title, source.snippet))) return result;

  const rules: PolicyTestRule[] = ['native-combination', 'manual-exception'];
  const records = p.sources.flatMap(source => clauses(source.snippet).map(quote => ({ source, quote })));
  // Require complete coverage of the recorded passage, not only the selected
  // affirmative sentence. Unrecognized follow-up clauses keep the packet on
  // HOLD. Only exact review reminders from our authored fixtures are allowed.
  const fixtureReminder = /^(?:Confirm store eligibility and active code\/automatic-discount configuration|Review the originating override or script; a combination-settings change is not established as a fix|Inspect the active coupon[’']s restrictions and intent)\.$/iu;
  if (records.some(({ quote }) => !rules.some(rule => matchesRule(quote, rule, p.context.platform))
    && !(p.mode === 'fixture' && fixtureReminder.test(quote)))) return result;
  // A second conflicting passage cannot be hidden by a cherry-picked candidate.
  const extraConditions = p.sources.some(source => unresolvedCondition.test(source.snippet
    .replace(/\bwhen\s+(?:the\s+)?(?:relevant\s+)?settings\s+permit\s+it\b/giu, '')
    .replace(/\beligible\s+(?=discount\s+classes\b)/giu, '')));
  const blocked = new Set(rules.filter(rule => extraConditions || records.some(({ quote }) => hasScope(quote, rule) && (negative.test(quote) || (rule === 'manual-exception' && unresolvedCondition.test(quote))))));
  const proposed = candidates === undefined
    ? { success: true as const, data: records.flatMap(({ source, quote }) => rules.filter(rule => matchesRule(quote, rule, p.context.platform)).map(ruleId => ({ sourceId: source.id, ruleId, quote, limitation: 'review-only' as const }))) }
    : PolicyTestCandidatesSchema.safeParse(candidates);
  if (!proposed.success) {
    result.rejectedCandidates = Array.isArray(candidates) ? Math.min(candidates.length, 100) : 1;
    return result;
  }
  const evidence: PolicyTestEvidence[] = [];
  for (const candidate of proposed.data) {
    const record = records.find(item => item.source.id === candidate.sourceId && item.quote === candidate.quote);
    if (!record || blocked.has(candidate.ruleId) || !matchesRule(record.quote, candidate.ruleId, p.context.platform)) {
      result.rejectedCandidates++;
      continue;
    }
    if (!evidence.some(item => item.sourceId === candidate.sourceId && item.ruleId === candidate.ruleId)) {
      evidence.push({ sourceId: record.source.id, url: record.source.url, quote: record.quote, ruleId: candidate.ruleId });
    }
  }
  const normalEvidence = evidence.filter(item => item.ruleId === 'native-combination');
  const manualEvidence = evidence.filter(item => item.ruleId === 'manual-exception');
  if (action === 'review-combination-settings' && normalEvidence.length) {
    result.cards[0] = { ...result.cards[0], verdict: 'supported', evidence: normalEvidence,
      reason: 'The passage supports investigating combination controls in this hypothetical native-discount scenario. It does not establish a misconfiguration or authorize a change.',
      nextCheck: p.context.platform === 'Shopify' ? 'Inspect the active code/automatic discount combination classes and store eligibility; verify promotion intent before a small controlled settings test.' : 'Inspect the active coupon individual-use controls and usage restrictions; verify promotion intent before a small controlled settings test.',
      missingEvidence: ['Actual store eligibility, active settings, promotion intent and policy effective date'] };
  }
  if (manualEvidence.length) {
    result.cards[1] = { ...result.cards[1], verdict: action === 'review-combination-settings' ? 'contradicted' : 'supported', evidence: manualEvidence,
      reason: action === 'review-combination-settings' ? 'A matching manual exception rebuts using a combination-settings change as an established remedy in this hypothetical manual-discount scenario.' : 'A matching manual exception supports investigating the originating override path in this hypothetical scenario. It does not establish staff error or approve a remedy.',
      nextCheck: 'Audit staff/manual POS and draft-order overrides, permissions and promotion intent; confirm transaction scope and the effective policy before a controlled test.',
      missingEvidence: ['Actual override record, permissions, transaction scope, promotion intent and policy effective date'] };
  }
  result.status = result.cards.some(card => card.verdict !== 'hold') ? 'ready' : 'hold';
  return result;
}
