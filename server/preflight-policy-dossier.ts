import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { PolicyReviewDossier } from '../shared/policy-review-dossier.js';

/** Evidence for a human review, never an input to proposal approval or a model. */
export function policyReviewDossier(body: string, retrievedAt = new Date().toISOString()): PolicyReviewDossier | undefined {
  const candidates: PolicyReviewDossier['quotes'] = [];
  // Keep exact continuous source spans, including a conditional antecedent or
  // denial. Do not assemble fragments into a new apparent policy statement.
  // Paragraph boundaries only: decimal points, version numbers and a single
  // line break must never remove the condition governing a discount clause.
  for (const match of body.matchAll(/[\s\S]+?(?=\r?\n[ \t]*\r?\n|$)/gu)) {
    const text = match[0].trim();
    if (text.length < 40 || text.length > 600 || /<[^>]*>|[\p{Cc}\p{Cf}]/u.test(text.replace(/[\t\n\r]/gu, ''))) continue;
    if (!/\bdiscounts?\b/iu.test(text) || !/\b(?:combin\w*|eligib\w*|settings)\b/iu.test(text)) continue;
    const start = match.index! + match[0].indexOf(text);
    candidates.push({ text, start, end: start + text.length });
  }
  const priority = (text: string) => /\b(?:cannot|not|never|can't|unless|except)\b/iu.test(text) ? 0 : /\b(?:if|when|only|provided)\b/iu.test(text) ? 1 : 2;
  const quotes = candidates.sort((a, b) => priority(a.text) - priority(b.text) || a.start - b.start).slice(0, 3).sort((a, b) => a.start - b.start);
  if (!quotes.length) return undefined;
  return {
    kind: 'unreviewed-policy', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations',
    retrievedAt, bodySha256: bytesToHex(sha256(new TextEncoder().encode(body))), bodyLength: body.length, quotes,
    unresolved: ['POLICY_VERSION_REVIEW', 'EFFECTIVE_DATE', 'STORE_ELIGIBILITY', 'COMBINATION_SETTINGS', 'CHECKOUT_BEHAVIOR'],
  };
}
