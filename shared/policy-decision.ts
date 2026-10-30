import type { IssueKind, PolicyDecision, ResearchPacket } from './types.js';
import { incompatibleSourceRegion, unresolvedPolicyStatement } from './policy-source-scope.js';

const sentences = (text: string) => (text.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? []).map(t => t.trim()).filter(Boolean);

// A shipping passage supports review only when it states a pricing mechanism that can make
// the billed cost exceed the charged fee. Generic words ("rate", "postage", "measure") do not.
// ponytail: keyword match, not negation-aware ("no surcharge" still matches); upgrade to per-sentence checks if live passages need it.
const shippingMechanism = /\b(?:dimensional|DIM|billable)\s*(?:\(DIM\)\s*)?weight\b|\b(?:size|weight|dimension)s?\s+(?:and\s+(?:size|weight)\s+)?(?:limits?|maximums?)\b|\bmaximum\s+(?:size|weight|dimensions?)\b|\b(?:non-?standard|non-?compliance|oversized?|additional handling)\b[^.]{0,30}\b(?:fees?|surcharges?|charges?)\b|\bsurcharges?\b/i;

// A conservative routing rule, not an LLM-asserted policy validation or root-cause claim.
export function decidePolicy(kind: IssueKind, packet: Pick<ResearchPacket, 'context' | 'sources' | 'status'>): PolicyDecision {
  const base = { sourceIds: [] as string[], disprove: kind === 'shipping' ? 'The carrier invoice line, measured package dimensions and weight, the service level billed, and the contracted rate could disprove this hypothesis.' : 'The original promotion record, store eligibility, applicable policy effective date, and a controlled test could disprove this hypothesis.' };
  if (packet.context.region !== 'US' || packet.sources.some(incompatibleSourceRegion)) return { ...base, status: 'hold', constraint: 'Region applicability is missing or mismatched; this demo supports US context only.', nextCheck: 'Confirm the operating region and retrieve an applicable policy before proposing a change.' };
  if (packet.sources.some(source => unresolvedPolicyStatement(source.title, source.snippet))) return { ...base, status: 'hold', constraint: 'A supplied passage contains a retraction, expiry or contrary rule that this bounded checker cannot resolve.', nextCheck: 'Resolve the full-source conflict, scope and effective date before proposing a remedy.' };
  if (kind === 'discount' && (!packet.context.discountOrigin || packet.context.discountOrigin === 'unknown')) return { ...base, status: 'hold', constraint: 'The CSV does not identify whether discounts came from a code, a manual override, or an app/script.', nextCheck: 'Identify the discount origin on a flagged order; hold any combination-setting recommendation until it is known.' };
  if (kind === 'discount' && (packet.context.discountOrigin === 'app' || packet.context.discountOrigin === 'app-script')) return { ...base, status: 'hold', constraint: 'An app is not necessarily using the Scripts API. The documented Scripts API exception cannot be generalized to ordinary app discounts.', nextCheck: 'Identify the app discount application mechanism and retrieve its applicable policy; hold a settings remedy until the mechanism is known.' };
  if (packet.status !== 'ok' || !packet.sources.length) return { ...base, status: 'insufficient', constraint: 'No relevant safe policy passage is available. A citation ID alone is not evidence of applicability.', nextCheck: 'Retrieve an operative official policy passage and inspect its conditions before proposing a fix.' };
  if (kind === 'discount') {
    const passage = packet.sources.map(s => s.snippet).join(' ');
    const origin = packet.context.discountOrigin;
    if (origin === 'manual' || origin === 'scripts-api') {
      const relevantOrigin = origin === 'manual' ? /\bmanual(?:ly)?\b|\bdraft\b|\bPOS\b/i : /\bScripts\s+API\b/i;
      // Judge each sentence on its own: a keyword in one sentence cannot borrow
      // "applies regardless" from another sentence about a different origin.
      const relevant = packet.sources.flatMap(s => sentences(s.snippet).filter(text => relevantOrigin.test(text)).map(text => ({ id: s.id, text })));
      const affirmed = /\b(?:can bypass|bypasses|always apply|appl(?:y|ies|ied) regardless)\b/i;
      const denied = /\b(?:cannot|can't|never|must not|do not|does not|don't|doesn't|not)\b.{0,40}\b(?:bypass|override|always apply|apply regardless)\b|\bnot (?:an? )?exception\b|\bno exceptions?\b/i;
      const conditional = /\b(?:only if|unless|provided that|subject to)\b|\?/i;
      const positive = relevant.filter(r => affirmed.test(r.text) && !denied.test(r.text) && !conditional.test(r.text));
      if (positive.length && relevant.some(r => denied.test(r.text))) return { ...base, status: 'insufficient', constraint: 'The supplied passages conflict about exceptions for the selected discount origin.', nextCheck: 'Resolve the conflicting passages and effective dates on the official source; do not choose a setting change yet.' };
      // The documented manual/POS/draft and Scripts API exceptions are Shopify rules.
      if (positive.length && packet.context.platform === 'Shopify') return { ...base, sourceIds: [...new Set(positive.map(r => r.id))], status: 'contradicted', constraint: 'The policy passage describes an exception to combination settings for this seller-provided discount origin. A settings toggle is not established as a remedy. Confirm store/plan eligibility, transaction scope and the effective policy.', nextCheck: origin === 'manual' ? 'Audit staff/manual POS and draft-order overrides, permissions, and promotion intent before changing combination settings.' : 'Audit the originating Scripts API logic and its discount application path before changing combination settings.' };
      return { ...base, status: 'hold', constraint: 'An applicable manual or Scripts API exception has not been established by the available passage.', nextCheck: 'Inspect the originating override or Scripts API path and retrieve the matching exception policy before proposing a settings fix.' };
    }
    if (/combin|individual use|usage restrict/i.test(passage)) return { ...base, sourceIds: packet.sources.filter(s => /combin|individual use|usage restrict/i.test(s.snippet)).map(s => s.id), status: 'review', constraint: 'The passage supports reviewing combination or coupon restrictions, subject to store eligibility and configuration; it does not prove a misconfiguration.', nextCheck: packet.context.platform === 'WooCommerce' ? 'Inspect the coupon’s individual-use restriction and usage conditions on a flagged order; verify intent before a small test.' : 'Inspect each active code/automatic discount’s combination classes and store eligibility; verify intent before a small settings test.' };
    return { ...base, status: 'insufficient', constraint: 'The passage lacks an operative combination-setting condition.', nextCheck: 'Find the applicable combination-setting clause before recommending a policy change.' };
  }
  const mechanism = packet.sources.filter(s => shippingMechanism.test(s.snippet));
  if (mechanism.length) return { ...base, sourceIds: mechanism.map(s => s.id), status: 'review', constraint: 'The cited carrier passage states a pricing mechanism (dimensional weight, size/weight limits, or a noncompliance fee or surcharge) that can push the billed cost above the fee charged. The CSV lacks service, dimensions, zone and contracted-rate terms, so this supports an invoice review, not a cause.', nextCheck: packet.context.carrier === 'UPS' ? 'Compare measured package dimensions, billable weight, service and contracted rate against one flagged UPS invoice.' : 'Compare service, package measurements, destination and the applicable USPS rate table against one flagged invoice.' };
  return { ...base, status: 'insufficient', constraint: 'The passage names no pricing mechanism (dimensional weight, size/weight limits, noncompliance fee or surcharge) that could explain an overrun.', nextCheck: 'Retrieve the matching carrier/service rate and measurement policy before proposing a packaging change.' };
}
