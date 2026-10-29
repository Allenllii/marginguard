import type { IssueKind, PolicyDecision, ResearchPacket } from './types.js';

// A conservative routing rule, not an LLM-asserted policy validation or root-cause claim.
export function decidePolicy(kind: IssueKind, packet: Pick<ResearchPacket, 'context' | 'sources' | 'status'>): PolicyDecision {
  const base = { sourceIds: [] as string[], disprove: 'The original promotion record, store eligibility, applicable policy effective date, and a controlled test could disprove this hypothesis.' };
  if (packet.context.region !== 'US' || packet.sources.some(s => s.sourceRegion === 'UK')) return { ...base, status: 'hold', constraint: 'Region applicability is missing or mismatched; this demo supports US context only.', nextCheck: 'Confirm the operating region and retrieve an applicable policy before proposing a change.' };
  if (kind === 'discount' && (!packet.context.discountOrigin || packet.context.discountOrigin === 'unknown')) return { ...base, status: 'hold', constraint: 'The CSV does not identify whether discounts came from a code, a manual override, or an app/script.', nextCheck: 'Identify the discount origin on a flagged order; hold any combination-setting recommendation until it is known.' };
  if (packet.status !== 'ok' || !packet.sources.length) return { ...base, status: 'insufficient', constraint: 'No relevant safe policy passage is available. A citation ID alone is not evidence of applicability.', nextCheck: 'Retrieve an operative official policy passage and inspect its conditions before proposing a fix.' };
  const passage = packet.sources.map(s => s.snippet).join(' ');
  if (kind === 'discount') {
    const origin = packet.context.discountOrigin;
    if (origin === 'manual' || origin === 'app-script') {
      const relevantOrigin = origin === 'manual' ? /\bmanual(?:ly)?\b|\bdraft\b|\bPOS\b/i : /\b(?:scripts?|apps?)\b/i;
      const relevant = packet.sources.filter(s => relevantOrigin.test(s.snippet));
      const affirmed = /\b(?:can bypass|bypasses|always apply|appl(?:y|ies|ied) regardless)\b/i;
      const denied = /\b(?:cannot|can't|never|must not|do not|does not|don't|doesn't|not)\b.{0,40}\b(?:bypass|override|always apply|apply regardless)\b|\bnot (?:an? )?exception\b|\bno exceptions?\b/i;
      const positive = relevant.filter(s => affirmed.test(s.snippet));
      if (positive.length && relevant.some(s => denied.test(s.snippet))) return { ...base, status: 'insufficient', constraint: 'The supplied passages conflict about exceptions for the selected discount origin.', nextCheck: 'Resolve the conflicting passages and effective dates on the official source; do not choose a setting change yet.' };
      const supporting = positive.filter(s => !denied.test(s.snippet));
      if (supporting.length) return { ...base, sourceIds: supporting.map(s => s.id), status: 'contradicted', constraint: 'The policy passage describes an exception to combination settings for this seller-provided discount origin. A settings toggle is not established as a remedy. Confirm store/plan eligibility, transaction scope and the effective policy.', nextCheck: origin === 'manual' ? 'Audit staff/manual POS and draft-order overrides, permissions, and promotion intent before changing combination settings.' : 'Audit the originating app/script logic and its discount application path before changing combination settings.' };
      return { ...base, status: 'hold', constraint: 'An applicable manual/app exception has not been established by the available passage.', nextCheck: 'Inspect the originating override or app/script and retrieve the matching exception policy before proposing a settings fix.' };
    }
    if (/combin|individual use|usage restrict/i.test(passage)) return { ...base, sourceIds: packet.sources.filter(s => /combin|individual use|usage restrict/i.test(s.snippet)).map(s => s.id), status: 'review', constraint: 'The passage supports reviewing combination or coupon restrictions, subject to store eligibility and configuration; it does not prove a misconfiguration.', nextCheck: packet.context.platform === 'WooCommerce' ? 'Inspect the coupon’s individual-use restriction and usage conditions on a flagged order; verify intent before a small test.' : 'Inspect each active code/automatic discount’s combination classes and store eligibility; verify intent before a small settings test.' };
    return { ...base, status: 'insufficient', constraint: 'The passage lacks an operative combination-setting condition.', nextCheck: 'Find the applicable combination-setting clause before recommending a policy change.' };
  }
  if (/dimension|weight|rate|postage|measure|surcharge/i.test(passage)) return { ...base, sourceIds: packet.sources.filter(s => /dimension|weight|rate|postage|measure|surcharge/i.test(s.snippet)).map(s => s.id), status: 'review', constraint: 'Carrier rules support an invoice/measurement review, but the CSV lacks service, dimensions, zone, and contracted-rate terms.', nextCheck: packet.context.carrier === 'UPS' ? 'Compare measured package dimensions, billable weight, service and contracted rate against one flagged UPS invoice.' : 'Compare service, package measurements, destination and the applicable USPS rate table against one flagged invoice.' };
  return { ...base, status: 'insufficient', constraint: 'The passage contains no usable shipping-cost condition.', nextCheck: 'Retrieve the matching carrier/service rate and measurement policy before proposing a packaging change.' };
}
