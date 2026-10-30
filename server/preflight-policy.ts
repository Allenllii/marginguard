import { z } from 'zod';
import { boundedJson } from './http.js';
import { inferredSourceRegion, unresolvedPolicyStatement } from '../shared/policy-source-scope.js';
import { inspectCombinationRestrictions, isReviewedPreflightSource } from './preflight-policy-scope.js';

// This is a deliberately small source catalog, not a general URL import API.
// Official page inspected 2026-10-29:
// https://help.shopify.com/en/manual/discounts/discount-combinations
const POLICY_URL = 'https://help.shopify.com/en/manual/discounts/discount-combinations';
const POLICY_TITLE = 'Combining discounts — Shopify Help Center';
const MAX_BODY_BYTES = 200_000;
const directives = /ignore.{0,60}(?:instructions?|previous)|system\s+prompt|api[\s_-]*key|execute.{0,30}(?:code|command)|send.{0,40}(?:secret|credential)|you are (?:chatgpt|an assistant)|<\/?(?:script|iframe)\b/iu;
const SearchResponse = z.object({
  results: z.array(z.object({ title: z.string().min(1).max(2000), url: z.string().max(2048), content: z.string().max(30_000).default('') })).max(3),
  failed_results: z.array(z.unknown()).max(3).optional(),
});
const ExtractResponse = z.object({
  results: z.array(z.object({ url: z.string().max(2048), raw_content: z.string().min(40).max(80_000) })).max(1),
  // HTTP 200 can contain per-URL failures. Absence is not proof of success.
  failed_results: z.array(z.unknown()).max(20),
});

export interface PreflightPolicyResult {
  mode: 'live' | 'fixture';
  status: 'HOLD' | 'REFERENCE_READY';
  sources: { id: string; title: string; url: string; snippet: string }[];
  reason: string;
}

function hold(mode: PreflightPolicyResult['mode'], reason: string, code?: string): PreflightPolicyResult {
  return { mode, status: 'HOLD', sources: [], reason: code ? `[${code}] ${reason}` : reason };
}

/** Exact byte-for-byte catalog membership rejects URL parser normalization tricks. */
function allowedUrl(value: string): boolean {
  return value === POLICY_URL;
}

function safeText(value: string): boolean {
  return !directives.test(value) && !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\t\n\r]/g, ''));
}

function policyFailure(value: string): string | null {
  // Inspect the whole extraction before truncating the display excerpt. These
  // exclusion rules abstain; they do not claim to understand arbitrary policies.
  if (!safeText(value)) return 'UNSAFE_TEXT';
  if (unresolvedPolicyStatement(POLICY_TITLE, value)) return 'UNRESOLVED_STATEMENT';
  const region = inferredSourceRegion(POLICY_TITLE, value);
  if (region === 'UK' || region === 'other') return 'OUTSIDE_REGION';
  const positive = /\b(?:can|may|allow(?:s|ed)?)\b.{0,100}\bcombin(?:e|ed|ing|ation)\b|\bcombin(?:ation|able)\b.{0,100}\b(?:eligible|eligibility|settings|allows?|permit)\b/iu.test(value);
  const blanketDenial = /\b(?:all|no|never)\s+(?:discount\s+)?combinations?\b.{0,60}\b(?:allowed|permitted|possible|supported)|\bdiscounts?\b.{0,35}\b(?:can never|cannot ever|must never)\b.{0,35}\bcombin/iu.test(value);
  // Only the exact reviewed source snapshot can classify its known conditional
  // denials. Unknown or changed denials still hold; source text is unchanged.
  const scopedDenial = inspectCombinationRestrictions(value).unresolvedDenial;
  if (!positive) return 'PERMISSION_MISSING';
  if (blanketDenial) return 'BLANKET_CONTRADICTION';
  if (scopedDenial) return 'SCOPED_CONTRADICTION';
  if (!/\bdiscounts?\b/iu.test(value)) return 'DISCOUNT_TERM_MISSING';
  if (!/\b(?:eligible|eligibility|combination settings)\b/iu.test(value)) return 'ELIGIBILITY_TERM_MISSING';
  return null;
}

function supportingExcerpt(value: string): string | null {
  const compact = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const sentences = compact.split(/(?<=[.!?])\s+/u);
  const permission = /\b(?:can|may|allow(?:s|ed)?)\b.{0,100}\bcombin(?:e|ed|ing|ation)\b|\bcombin(?:ation|able)\b.{0,100}\b(?:eligible|eligibility|settings|allows?|permit)\b/iu;
  const constraint = /\b(?:eligible|eligibility|combination settings)\b/iu;
  for (let index = 0; index < sentences.length; index++) {
    if (!permission.test(sentences[index]) || !/\bdiscounts?\b/iu.test(sentences[index])) continue;
    // Retain complete adjacent sentences; never splice unrelated clauses or
    // truncate a supporting condition into an apparent permission.
    for (const [start, end] of [[index, index + 1], [index, index + 2], [Math.max(0, index - 1), index + 1]]) {
      const excerpt = sentences.slice(start, end).join(' ');
      if (excerpt.length <= 1200 && constraint.test(excerpt)) return excerpt;
    }
  }
  return null;
}

/**
 * Real Search/Extract protocol adapter. The caller injects a transport that
 * reserves and meters EACH HTTP attempt. It must also gate the seller context.
 * No arbitrary URL, activity description, CSV, SKU, cost or customer data enters
 * either request. References never establish store/checkout applicability.
 */
export async function retrievePreflightPolicy(config: { enabled?: boolean; key?: string }, request: typeof fetch, rejectContent?: (text: string) => boolean, reviewSource: (text: string) => boolean = isReviewedPreflightSource): Promise<PreflightPolicyResult> {
  if (!config.enabled || !config.key) return hold('fixture', 'Live policy retrieval is disabled or unconfigured. No provider request was made; no current policy evidence is claimed.');
  const headers = { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' };
  const rejected = (text: string) => rejectContent?.(text) === true || text.includes(config.key!);
  // Codes are static classifications only. Never return provider error text,
  // schema values, source fragments or credentials as diagnostic messages.
  let stage: 'SEARCH' | 'EXTRACT' = 'SEARCH';
  let operation: 'REQUEST' | 'BODY' = 'REQUEST';
  try {
    const search = await request('https://api.tavily.com/search', {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ query: 'Shopify official combining discounts eligibility combination settings product order shipping discounts', topic: 'general', search_depth: 'basic', max_results: 3, include_domains: ['help.shopify.com'], include_domains_mode: 'restrict', include_answer: false, include_raw_content: false, include_images: false, include_usage: true, auto_parameters: false }),
    });
    if (!search.ok) return hold('live', 'Policy search failed. No automatic retry or fixture substitution was made.', 'SEARCH_HTTP_FAILED');
    operation = 'BODY';
    const parsedSearch = SearchResponse.safeParse(await boundedJson(search, MAX_BODY_BYTES));
    if (!parsedSearch.success) return hold('live', 'Policy search did not satisfy the bounded response schema.', 'SEARCH_SCHEMA_INVALID');
    const found = parsedSearch.data;
    if (found.failed_results?.length) return hold('live', 'Search results reported provider failures.', 'SEARCH_PROVIDER_FAILURE');
    if (found.results.some(result => !safeText(result.title + ' ' + result.content))) return hold('live', 'Search results failed the source safety check.', 'SEARCH_UNSAFE_TEXT');
    if (found.results.some(result => rejected(result.title + ' ' + result.content))) return hold('live', 'Search results failed the source safety check.', 'SEARCH_CREDENTIAL_ECHO');
    const candidates = found.results.filter(result => allowedUrl(result.url));
    if (candidates.length !== 1) return hold('live', 'Exactly one approved official policy reference is required before extraction.', 'SEARCH_CATALOG_CARDINALITY');
    const searchFailure = policyFailure(candidates[0].title + ' ' + candidates[0].content);
    if (searchFailure) return hold('live', 'The selected search passage is incomplete, conflicting or outside the supported source scope.', `SEARCH_${searchFailure}`);
    const selectedUrl = candidates[0].url;
    stage = 'EXTRACT'; operation = 'REQUEST';
    const extracted = await request('https://api.tavily.com/extract', {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ urls: [selectedUrl], extract_depth: 'basic', include_images: false, include_favicon: false, format: 'text', include_usage: true }),
    });
    if (!extracted.ok) return hold('live', 'Policy extraction failed. No automatic retry or fixture substitution was made.', 'EXTRACT_HTTP_FAILED');
    operation = 'BODY';
    const parsedExtract = ExtractResponse.safeParse(await boundedJson(extracted, MAX_BODY_BYTES));
    if (!parsedExtract.success) return hold('live', 'Policy extraction did not satisfy the bounded response schema.', 'EXTRACT_SCHEMA_INVALID');
    const body = parsedExtract.data;
    if (body.failed_results.length) return hold('live', 'Extraction reported one or more per-URL provider failures.', 'EXTRACT_PROVIDER_FAILURE');
    if (body.results.length !== 1) return hold('live', 'Extraction did not return the exact expected result count.', 'EXTRACT_RESULT_CARDINALITY');
    if (body.results[0].url !== selectedUrl || !allowedUrl(body.results[0].url)) return hold('live', 'Extraction returned an unapproved source URL.', 'EXTRACT_SOURCE_URL_MISMATCH');
    if (rejected(body.results[0].raw_content)) return hold('live', 'Extracted content failed the credential-echo check.', 'EXTRACT_CREDENTIAL_ECHO');
    const extractFailure = policyFailure(body.results[0].raw_content);
    if (extractFailure) return hold('live', 'Extracted policy evidence is incomplete, conflicting or outside the supported source scope.', `EXTRACT_${extractFailure}`);
    // A finite prose blacklist cannot establish that an arbitrary policy is
    // coherent. Runtime accepts only the exact independently reviewed snapshot.
    // Tests may inject an authored-fixture reviewer as a trusted code dependency;
    // no request field or runtime environment can override this boundary.
    if (!reviewSource(body.results[0].raw_content)) return hold('live', 'This policy snapshot has not been reviewed. Source changes require a new review before hypothetical preparation; checkout remains HOLD.', 'EXTRACT_SOURCE_REVIEW_REQUIRED');
    const snippet = supportingExcerpt(body.results[0].raw_content);
    if (!snippet) return hold('live', 'No complete bounded passage supports the selected reference. Review the source conditions before preparing a proposal.', 'EXTRACT_EXCERPT_MISSING');
    return {
      mode: 'live', status: 'REFERENCE_READY', sources: [{ id: 'S1', title: POLICY_TITLE, url: POLICY_URL, snippet }],
      reason: `Official reference retrieved with Search and Extract. ${inspectCombinationRestrictions(body.results[0].raw_content).conditionalRestrictions} reviewed conditional restrictions remain unverified. Changed source text containing denials requires a new review. Seller confirmation and a bounded simulation are still required; checkout eligibility and behavior remain unverified.`,
    };
  } catch {
    // Includes byte/JSON/schema limits, budget denials and uncertain transport
    // outcomes. Do not retain arbitrary provider bodies or thrown error text.
    return hold('live', 'Policy retrieval did not produce validated evidence. No automatic retry was made; HOLD remains in effect.', `${stage}_${operation}_FAILED`);
  }
}
