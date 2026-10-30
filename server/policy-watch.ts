import { z } from 'zod';
import type { ResearchContext, RetrievalStep } from '../shared/types.js';
import { boundedJson } from './http.js';
import { RECORDED_RETRIEVALS, REVIEWED_OPERATIVE_SENTENCES, operativeHash, operativeSentences, type TavilyConfig } from './tavily.js';
import recorded from '../evidence/policy-watch-20261030.json' with { type: 'json' };

// Policy watch: re-extract the official pages that decisions rely on and compare
// the operative-sentence hash with the reviewed one, exactly as research() does.
export type WatchStatus = 'unchanged' | 'changed' | 'unavailable';
export interface WatchedPage { id: string; title: string; url: string; dependsOn: string; reviewedAt: string; fingerprint: string; note?: string }
export interface WatchResult { id: string; status: WatchStatus; currentFingerprint?: string; summary?: string }
export interface WatchCheck { mode: 'live' | 'recorded'; checkedAt: string; label: string; results: WatchResult[]; retrieval: { steps: RetrievalStep[] } }

type Checkable = WatchedPage & { origin: 'manual' | 'native'; sha256: string; reviewedText: string };
const recordedSources = Object.values(RECORDED_RETRIEVALS).flatMap(r => r.sources);
const DEPENDS: Record<string, string> = {
  'manual:https://help.shopify.com/en/manual/discounts/discount-combinations': 'Manual / POS / draft-order discount decisions (Policy evidence)',
  'manual:https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts': 'Manual POS discount decisions (Policy evidence)',
  'native:https://help.shopify.com/en/manual/discounts/discount-combinations': 'Automatic discount + discount code decisions (Policy evidence)',
};
// One entry per reviewed fingerprint; the reviewed text is the recorded passage it hashes.
const CHECKABLE: Checkable[] = REVIEWED_OPERATIVE_SENTENCES.map(r => {
  const source = recordedSources.find(s => s.url === r.url && operativeHash(s.snippet) === r.sha256);
  if (!source || (r.origin !== 'manual' && r.origin !== 'native')) throw new Error(`No recorded reviewed passage for ${r.url}`);
  const id = `${r.url.includes('/shopify-pos/') ? 'shopify-pos' : 'shopify-combining'}-${r.origin}`;
  return { id, title: source.title, url: r.url, dependsOn: DEPENDS[`${r.origin}:${r.url}`] ?? 'Shopify discount decisions', reviewedAt: r.reviewedAt, fingerprint: r.sha256, origin: r.origin, sha256: r.sha256, reviewedText: source.snippet };
});
// Mirrors REVIEWED_SOURCE_SHA256 in server/preflight-policy-scope.ts (test-asserted).
const PREFLIGHT_SHA256 = '21d596875d4d0f4a86db1b9e9bc0283c9ae1ce5e4de29b188b4e2e53935c51e1';
const usps = RECORDED_RETRIEVALS['usps-shipping'].sources[0];
export const WATCHED_PAGES: WatchedPage[] = [
  ...CHECKABLE.map(({ id, title, url, dependsOn, reviewedAt, fingerprint }) => ({ id, title, url, dependsOn, reviewedAt, fingerprint })),
  { id: 'promo-preflight', title: 'Combining discounts — Shopify Help Center', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', dependsOn: 'Promo Preflight policy reference (REFERENCE_READY vs HOLD)', reviewedAt: '2026-10-30', fingerprint: PREFLIGHT_SHA256, note: 'This fingerprint covers the exact page bytes in Tavily’s text format, which the markdown batch cannot recompute. Promo Preflight re-checks it on every live run and holds if it differs.' },
  { id: 'usps-shipping', title: usps.title, url: usps.url, dependsOn: 'USPS shipping-overrun policy evidence', reviewedAt: 'Recorded 2026-10-30 · not reviewed', fingerprint: 'not fingerprinted', note: 'No reviewed fingerprint exists, so there is nothing to compare; this page is not part of the check.' },
];

const MAX_BYTES = 500_000;
const ExtractSchema = z.object({ results: z.array(z.object({ url: z.string().max(2048), raw_content: z.string().max(250_000).nullable().default('') })).max(5), failed_results: z.array(z.unknown()).max(5).optional(), request_id: z.string().max(200).optional(), usage: z.object({ credits: z.number().optional() }).optional() });
const context = (origin: Checkable['origin']): ResearchContext => ({ platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: origin });
// Same sentence boundary pageSentences uses; operativeSentences joins its picks with one space.
const sentences = (text: string) => text ? text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/u) : [];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Plain text only: no markup, no control characters, bounded length. */
const clip = (s: string, max = 240) => { const t = s.replace(/<[^>]*>|[<>]/g, ' ').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
export const MAX_SUMMARY = 420;

export function changeSummary(reviewedText: string, currentText: string): string {
  const before = sentences(reviewedText), after = sentences(currentText);
  const added = after.filter(s => !before.some(b => norm(b) === norm(s))), removed = before.filter(b => !after.some(s => norm(s) === norm(b)));
  const plural = (n: number) => `${n} operative sentence${n === 1 ? '' : 's'}`;
  const first = added[0] ? `First new sentence: “${clip(added[0])}”` : removed[0] ? `First removed sentence: “${clip(removed[0])}”` : 'Same sentences in a different order.';
  return clip(`${plural(added.length)} added, ${removed.length} removed. ${first} Decisions citing this page are kept but need re-review.`, MAX_SUMMARY);
}

/** Classifies one extracted page exactly as research()/changedPolicy would hash it. */
export function classify(page: Checkable, raw: string | undefined): WatchResult {
  if (raw === undefined) return { id: page.id, status: 'unavailable', summary: 'Tavily Extract did not return this page; nothing was compared.' };
  const current = operativeSentences(raw, page.title, 'discount', context(page.origin)), hash = operativeHash(current);
  return hash === page.sha256 ? { id: page.id, status: 'unchanged', currentFingerprint: hash } : { id: page.id, status: 'changed', currentFingerprint: hash, summary: changeSummary(page.reviewedText, current) };
}
export const CHECKABLE_PAGES: readonly Checkable[] = CHECKABLE;

/** ONE Tavily Extract call for every watched URL (basic, markdown, bounded, no retry). The caller reserves budget first. */
export async function checkPolicyWatch(config: TavilyConfig, request: typeof fetch, now = () => new Date()): Promise<WatchCheck> {
  const urls = [...new Set(CHECKABLE.map(p => p.url))], start = performance.now(), pages = new Map<string, string>();
  let requestId: string | undefined, credits: number | undefined, failure: string | undefined;
  try {
    const response = await request('https://api.tavily.com/extract', { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000), body: JSON.stringify({ urls, extract_depth: 'basic', format: 'markdown', timeout: 10, include_images: false, include_favicon: false, include_usage: true }) });
    requestId = response.headers.get('x-request-id') || undefined;
    if (!response.ok) failure = `HTTP ${response.status}`;
    else {
      const raw = ExtractSchema.parse(await boundedJson(response, MAX_BYTES));
      requestId ??= raw.request_id; credits = raw.usage?.credits;
      // Only the requested URLs (exact, or the same page without #fragment); never a body that echoes the key.
      for (const r of raw.results) { const url = urls.find(u => u === r.url || u === r.url.split('#')[0]); if (url && !pages.has(url) && r.raw_content && !r.raw_content.includes(config.key!)) pages.set(url, r.raw_content); }
      if (!pages.size) failure = 'no usable page returned';
    }
  } catch { failure = 'failed, timed out, or returned oversized or unreadable data'; }
  const latencyMs = Math.round(performance.now() - start);
  const steps: RetrievalStep[] = urls.map((url, n) => ({ op: 'extract', url, ok: pages.has(url), ...(n === 0 ? { latencyMs, ...(credits !== undefined ? { credits } : {}) } : {}), ...(requestId ? { requestId } : {}), ...(pages.has(url) ? {} : { detail: failure ?? 'page not returned' }) }));
  return { mode: 'live', checkedAt: now().toISOString(), label: `Live check${requestId ? ` (request ${requestId.slice(0, 8)}…)` : ''}`, results: CHECKABLE.map(p => classify(p, pages.get(p.url))), retrieval: { steps } };
}

/** The last real check, replayed verbatim and labelled as recorded; never presented as current. */
export function recordedPolicyWatch(): WatchCheck | null {
  const check = (recorded as { check: WatchCheck | null }).check;
  if (!check) return null;
  const id = check.retrieval.steps.find(s => s.requestId)?.requestId;
  return { ...check, mode: 'recorded', label: `Recorded live check (request ${id ? `${id.slice(0, 8)}…` : 'ID not returned'}, ${check.checkedAt.slice(0, 10)})` };
}
