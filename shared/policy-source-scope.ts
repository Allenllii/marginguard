import type { PolicySource } from './types.js';

// These are conservative exclusion checks, never a claim to understand arbitrary
// policy prose or certify that a country-specific document applies to a store.
export function inferredSourceRegion(title: string, content: string): PolicySource['sourceRegion'] {
  const text = `${title} ${content}`;
  // "Eligible merchants only" limits store eligibility, not geography. Remove
  // only that exact neutral qualifier from the geographic restriction scan;
  // no country qualifier or original source passage is discarded.
  const regionalText = text.replace(/\b(?:for|in|within|limited to|restricted to)\s+eligible\s+(?:stores?|merchants?)\s+(?:only|exclusively)\b|\b(?:only|exclusively)\s+(?:for|in|within|to)\s+eligible\s+(?:stores?|merchants?)\b/giu, '[store eligibility restriction]');
  const uk = /\b(?:United Kingdom|UK|British)\b/iu.test(text);
  const other = /\b(?:Australia|Australian|Canada|Canadian|New Zealand|Europe|European|EU|EEA|India|Indian|Japan|Japanese|China|Chinese|Singapore|Mexico|Mexican|Brazil|South Africa)\b/iu.test(text);
  const us = /\b(?:United States|US(?:A)? (?:stores?|merchants?|markets?|only)|American (?:stores?|merchants?))\b/iu.test(text);
  const unidentifiedRestriction = /\b(?:for|in|within|outside|except|limited to|restricted to)\b.{0,100}\b(?:stores?|merchants?|markets?|accounts?|countries|regions?)\b.{0,30}\b(?:only|exclusively)\b/iu.test(regionalText);
  // Unknown local qualifiers override a distant US mention. A finite country
  // dictionary cannot safely recognize every explicitly limited jurisdiction.
  const explicitOnly = [...regionalText.matchAll(/\b(?:for|in|within|limited to|restricted to)\s+([^.!?;:,]{1,70}?)\s+(?:stores?|merchants?|markets?|accounts?)\s+(?:only|exclusively)\b/giu)];
  explicitOnly.push(...regionalText.matchAll(/\b(?:only|exclusively)\s+(?:for|in|within|to)\s+([^.!?;:,]{1,70}?)\s+(?:stores?|merchants?|markets?|accounts?)\b/giu));
  if (explicitOnly.some(match => !/^(?:(?:the|eligible)\s+)*(?:United States|US|USA|American)$/iu.test(match[1].trim()))) return 'other';
  if (other || (uk && us)) return 'other';
  if (uk) return 'UK';
  if (unidentifiedRestriction && !us) return 'other';
  if (us) return 'US';
  if (/\b(?:worldwide|globally|all countries|all markets)\b/iu.test(text)) return 'global';
  // Absence of a detected restriction does not prove global applicability.
  return undefined;
}

export function unresolvedPolicyStatement(title: string, content: string): boolean {
  const text = `${title} ${content}`;
  return /\b(?:this|that|it|these|those|guidance|policy|rule|claim|statement|sentence|exception)\b.{0,120}\b(?:not true|false|untrue|incorrect|invalid|outdated|expired|no longer applies|withdrawn|retracted|obsolete|superseded|hypothetical example)\b/iu.test(text)
    || /\bmanual\b.{0,100}\bdiscounts?\b.{0,60}\b(?:must|shall|have to|are required to)\b.{0,40}\b(?:follow|obey|respect|comply with)\b.{0,40}\bcombination settings\b/iu.test(text)
    || /\bdiscount combinations?\b.{0,50}\b(?:prohibited|forbidden|disallowed|not permitted)\b/iu.test(text);
}

export function incompatibleSourceRegion(source: Pick<PolicySource, 'title' | 'snippet' | 'sourceRegion'>): boolean {
  const inferred = inferredSourceRegion(source.title, source.snippet);
  return source.sourceRegion === 'UK' || source.sourceRegion === 'other' || inferred === 'UK' || inferred === 'other';
}
