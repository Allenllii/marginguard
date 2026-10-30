import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Bounded reference review, not general policy understanding.
 * The canonical Shopify document was retrieved and reviewed on 2026-10-30.
 * Its eight denial passages describe conditional settings / discount classes.
 * Only exact reviewed bytes receive this classification. Changed or unknown
 * sources containing denials abstain until separately reviewed. URL, injection,
 * retraction, region and blanket-denial guards run separately. Original source
 * and excerpts remain unchanged. This never certifies checkout eligibility.
 */
const REVIEWED_SOURCE_SHA256 = '21d596875d4d0f4a86db1b9e9bc0283c9ae1ce5e4de29b188b4e2e53935c51e1';

export function isReviewedPreflightSource(value: string): boolean {
  return bytesToHex(sha256(new TextEncoder().encode(value))) === REVIEWED_SOURCE_SHA256;
}

export function inspectCombinationRestrictions(value: string) {
  if (isReviewedPreflightSource(value)) return { conditionalRestrictions: 8, unresolvedDenial: false };
  // Never erase condition antecedents: a second prohibition or anaphoric tail
  // must remain visible. Unknown conditional examples intentionally HOLD.
  const negative = /\b(?:cannot|can\s+not|can't|can’t|do\s+not|don't|don’t|must\s+not|should\s+not|may\s+not|never)\s+(?:be\s+)?combin(?:e|ed|able)\b|\bnot\s+combinable\b/iu;
  return { conditionalRestrictions: 0, unresolvedDenial: negative.test(value) };
}
