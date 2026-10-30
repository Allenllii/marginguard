import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { IssueKind, PolicySource, ResearchContext, ResearchPacket, RetrievalStep } from '../shared/types.js';
import { boundedJson } from './http.js';
import { inferredSourceRegion, unresolvedPolicyStatement } from '../shared/policy-source-scope.js';

export const ContextSchema = z.object({ platform: z.enum(['Shopify', 'WooCommerce']), carrier: z.enum(['USPS', 'UPS']), region: z.enum(['US', 'UK', 'unknown']), discountOrigin: z.enum(['native', 'manual', 'scripts-api', 'app', 'app-script', 'unknown']).default('unknown') }).strict();
export const KindSchema = z.enum(['discount', 'shipping']);
export type TavilyConfig = { key?: string; enabled?: boolean };
export function tavilySettings(): TavilyConfig { return { key: process.env.TAVILY_API_KEY, enabled: process.env.TAVILY_ENABLE_LIVE === 'true' }; }
export function tavilyStatus(c = tavilySettings()) { return { mode: c.enabled && c.key ? 'configured' : 'fixture', endpoint: 'https://api.tavily.com/search' }; }
// Queries describe the seller's situation and ask for the governing official
// rule. They never presuppose the answer (no "bypass" or "exception" wording).
export function searchPlan(kind: IssueKind, context: ResearchContext) {
  ContextSchema.parse(context); KindSchema.parse(kind);
  const domain = kind === 'shipping' ? context.carrier === 'USPS' ? 'usps.com' : 'ups.com' : context.platform === 'Shopify' ? 'help.shopify.com' : 'woocommerce.com';
  const rules = context.platform === 'Shopify' ? 'discount combination settings' : 'coupon usage restrictions such as individual use';
  const origin = context.discountOrigin === 'manual' ? 'manually applied POS and draft order discounts' : context.discountOrigin === 'scripts-api' ? 'discounts added by the Scripts API' : context.discountOrigin === 'app' || context.discountOrigin === 'app-script' ? 'discounts applied by third-party apps' : 'automatic discounts and discount codes';
  const query = kind === 'shipping' ? `${context.carrier} how are United States package shipping prices determined by weight, dimensions and service` : `${context.platform} how do ${origin} interact with ${rules}`;
  return { query, domains: [domain], relevant: kind === 'shipping' ? /shipping|package|dimensional|postage|surcharge|weight|rates/i : kind === 'discount' ? /discount|coupon|promotion|combin/i : /return|refund|exchange/i };
}
const cleanText = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
export function selectPassage(content: string, kind: IssueKind, context: ResearchContext): string {
  const terms = kind === 'shipping' ? ['dimension', 'weight', 'surcharge', 'measure', 'rate', 'service'] : context.discountOrigin === 'manual' ? ['manual', 'draft', 'pos', 'bypass', 'regardless', 'always apply'] : context.discountOrigin === 'scripts-api' ? ['scripts api', 'bypass', 'regardless', 'always apply'] : ['combination settings', 'combin', 'eligible', 'restriction', 'individual use'];
  const score = (text: string) => terms.reduce((s, t) => s + (text.toLowerCase().includes(t) ? 1 : 0), 0);
  // Tavily joins its relevant chunks (chunks_per_source) with "[...]". Prefer the
  // whole chunk with the most context terms, in Tavily's order on ties.
  const chunks = cleanText(content).split(/\s*\[\.\.\.\]\s*/).filter(c => c.length >= 40 && c.length <= 1200);
  const chunk = chunks.map((text, i) => ({ text, i, score: score(text) })).sort((a, b) => b.score - a.score || a.i - b.i)[0];
  if (chunk?.score) return chunk.text;
  // Fallback: a 70-word keyword window over the full returned text.
  const words = cleanText(content).split(/\s+/), starts = new Set<number>([0]);
  words.forEach((word, i) => { if (terms.some(t => word.toLowerCase().includes(t.split(' ')[0]))) starts.add(Math.max(0, i - 12)); });
  const best = [...starts].map(start => { const text = words.slice(start, start + 70).join(' '); return { text, start, score: score(text) }; }).sort((a, b) => b.score - a.score || a.start - b.start)[0];
  return (best?.text ?? '').slice(0, 1200);
}
const passageKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const unsafeText = /ignore.{0,30}(instructions|previous)|system prompt|api.?key|execute.{0,20}(code|command)|send.{0,20}(secret|credential)|you are (chatgpt|an assistant)/i;
export function safeSources(raw: unknown, kind: IssueKind, context: ResearchContext): PolicySource[] {
  const parsed = z.object({ results: z.array(z.object({ title: z.string().max(2000), url: z.string().max(2048), content: z.string().max(30000).default(''), score: z.number().optional(), published_date: z.string().nullable().optional() })).max(20) }).parse(raw);
  const plan = searchPlan(kind, context), seen = new Set<string>(), seenPassages = new Set<string>();
  const accepted: PolicySource[] = [];
  for (const item of parsed.results) {
    let url: URL; try { url = new URL(item.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !plan.domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))) continue;
    if (!plan.relevant.test(item.title + ' ' + item.content) || (item.score !== undefined && item.score < 0.25)) continue;
    const content = cleanText(item.content);
    if (!content || unsafeText.test(content)) continue;
    // A #fragment is the same page, not an independent source. Keep the first.
    const page = url.href.split('#')[0];
    if (seen.has(page)) continue; seen.add(page);
    if (!plan.relevant.test(content) || content.length < 40) continue;
    // Inspect the complete returned text before selecting a short passage, so
    // truncation cannot discard an expiry or known contrary rule.
    if (unresolvedPolicyStatement(item.title, content)) continue;
    const snippet = selectPassage(item.content, kind, context);
    // Different URLs can return the same passage (mirrored help pages). Keep the first.
    if (seenPassages.has(passageKey(snippet))) continue; seenPassages.add(passageKey(snippet));
    accepted.push({ id: `S${accepted.length + 1}`, title: cleanText(item.title).slice(0, 180), url: url.href, snippet, publishedDate: item.published_date ? cleanText(item.published_date).slice(0, 40) : null, sourceRegion: inferredSourceRegion(item.title, content) });
    if (accepted.length === 3) break;
  }
  return accepted;
}

// --- Tavily Extract: full official page -> complete operative sentences -----
const EXTRACT_MAX_BYTES = 500_000;
function extractTerms(kind: IssueKind, context: ResearchContext): RegExp[] {
  if (kind === 'shipping') return [/\bdimension/i, /\bweigh/i, /\bsurcharge/i, /\bmeasure/i, /\brates?\b/i, /\bprices?\b/i];
  const exception = [/\bcombination (?:settings|restrictions)\b/i, /\bregardless\b/i, /\balways appl(?:y|ies)\b/i];
  if (context.discountOrigin === 'manual') return [...exception, /\bmanual(?:ly)?\b/i, /\bdraft orders?\b/i, /\bPOS\b/];
  if (context.discountOrigin === 'scripts-api') return [...exception, /\bScripts API\b/i];
  if (context.platform === 'WooCommerce') return [/\bindividual use\b/i, /\busage restrictions?\b/i, /\bcombin/i, /\bcoupons?\b/i];
  return [/\bcombination settings\b/i, /\bcombin(?:e|ed|es|ing)\b/i, /\beligib/i, /\bclass(?:es)?\b/i, /\bdiscount codes?\b/i, /\bautomatic discounts?\b/i];
}
/**
 * Splits an extracted page (markdown) into complete sentences. A list item keeps
 * its lead-in line ("The following discount types always apply ...: <item>"),
 * because the lead-in carries the rule the item depends on; `own` (the item's own
 * words) is what selection scores, so a shared lead-in does not lift every item.
 */
export function pageSentences(page: string): { text: string; own: string }[] {
  const units: { text: string; own: string }[] = [];
  let leadIn: string | null = null;
  for (const rawLine of page.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').split(/\r?\n/)) {
    const line = cleanText(rawLine.replace(/\*{1,3}|_{2,3}|`/g, ''));
    if (!line) continue;
    if (/^#{1,6}\s/.test(line) || line.startsWith('|')) { leadIn = null; continue; }
    const item = line.match(/^(?:[-+*•]|\d+\.)\s+(.*)$/)?.[1];
    if (item !== undefined) { if (/[.!?]$/.test(item)) units.push({ text: leadIn ? `${leadIn} ${item}` : item, own: item }); continue; }
    leadIn = line.endsWith(':') ? line : null;
    units.push(...line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/u).filter(t => /[.!?]$/.test(t)).map(t => ({ text: t, own: t })));
  }
  return units.filter(u => u.text.length >= 30 && u.text.length <= 500);
}
/**
 * Deterministic selection: at most three complete sentences that match the most
 * context terms, returned in page order and capped at 1200 characters. A relevant
 * sentence the scope checker cannot resolve (retraction, contrary rule) is always
 * kept, so decidePolicy holds instead of the selection hiding it.
 */
export function operativeSentences(page: string, title: string, kind: IssueKind, context: ResearchContext): string {
  const terms = extractTerms(kind, context), relevant = searchPlan(kind, context).relevant;
  const scored = pageSentences(page).map(({ text, own }, i) => ({ text, i, score: terms.filter(t => t.test(own)).length }))
    .filter(u => u.score > 0 && relevant.test(u.text) && !unsafeText.test(u.text));
  const ordered = [...scored.filter(u => unresolvedPolicyStatement(title, u.text)).slice(0, 1), ...[...scored].sort((a, b) => b.score - a.score || a.i - b.i)];
  const picked: typeof scored = [];
  for (const u of ordered) {
    if (picked.length === 3) break;
    if (picked.some(p => p.text === u.text) || [...picked, u].reduce((n, p) => n + p.text.length + 1, 0) > 1201) continue;
    picked.push(u);
  }
  return picked.sort((a, b) => a.i - b.i).map(u => u.text).join(' ');
}
/** SHA-256 of whitespace/case-normalized operative sentences (policy change detection). */
export const operativeHash = (text: string) => bytesToHex(sha256(new TextEncoder().encode(text.toLowerCase().replace(/\s+/g, ' ').trim())));
const sameUrl = (a: string, b: string) => { try { const x = new URL(a), y = new URL(b); x.hash = ''; y.hash = ''; return x.href === y.href; } catch { return false; } };
const ExtractSchema = z.object({ results: z.array(z.object({ url: z.string().max(2048), raw_content: z.string().max(250_000).nullable().default('') })).max(5), request_id: z.string().max(200).optional(), usage: z.object({ credits: z.number().optional() }).optional() });
export type ResearchHooks = {
  /** Reserves budget for ONE Extract call before it is sent. Absent: no Extract (search-only callers). */
  reserveExtract?: () => Promise<boolean>;
};
type Extracted = { pages: Map<string, string>; requestId?: string; credits?: number; latencyMs: number; failure?: string };
async function extractPages(urls: string[], config: TavilyConfig, request: typeof fetch): Promise<Extracted> {
  const start = performance.now(), pages = new Map<string, string>();
  try {
    const response = await request('https://api.tavily.com/extract', { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000), body: JSON.stringify({ urls, extract_depth: 'basic', format: 'markdown', timeout: 10, include_images: false, include_favicon: false, include_usage: true }) });
    const headerId = response.headers.get('x-request-id') || undefined;
    if (!response.ok) return { pages, requestId: headerId, latencyMs: Math.round(performance.now() - start), failure: `returned HTTP ${response.status}` };
    const raw = ExtractSchema.parse(await boundedJson(response, EXTRACT_MAX_BYTES));
    // Keep only the requested official URLs, never a page that echoes the key.
    // Response order is not guaranteed: match the exact URL first, then the same page without #fragment; never overwrite.
    for (const r of raw.results) { const url = urls.find(u => u === r.url) ?? urls.find(u => sameUrl(u, r.url)); if (url && !pages.has(url) && r.raw_content && !r.raw_content.includes(config.key!)) pages.set(url, r.raw_content); }
    return { pages, requestId: headerId ?? raw.request_id, credits: raw.usage?.credits, latencyMs: Math.round(performance.now() - start), failure: pages.size ? undefined : 'returned no usable page' };
  } catch { return { pages, latencyMs: Math.round(performance.now() - start), failure: 'failed, timed out, or returned oversized or unreadable data' }; }
}
function changedPolicy(sources: PolicySource[], fromExtract: Set<string>, kind: IssueKind, context: ResearchContext): ResearchPacket['policyChanged'] {
  if (kind !== 'discount' || context.platform !== 'Shopify') return undefined;
  for (const source of sources) {
    const reviewed = fromExtract.has(source.id) ? REVIEWED_OPERATIVE_SENTENCES.find(r => r.origin === context.discountOrigin && sameUrl(r.url, source.url)) : undefined;
    if (reviewed && reviewed.sha256 !== operativeHash(source.snippet)) return { url: source.url, reviewedAt: reviewed.reviewedAt };
  }
  return undefined;
}

// --- Recorded live retrievals, replayed verbatim offline --------------------
// Sources: manual = evidence/live-e2e-20261030.json (replay); native and USPS =
// evidence/live-retrieval-v3-20261030.json. Tests assert byte identity.
// Fixture packets never carry `proof`; request IDs appear in the note and steps.
type Recorded = { query: string; note: string; sources: PolicySource[]; steps: RetrievalStep[] };
export const RECORDED_RETRIEVALS: Record<'shopify-discount-manual' | 'shopify-discount-native' | 'usps-shipping', Recorded> = {
  "shopify-discount-manual": {
    "query": "Shopify how do manually applied POS and draft order discounts interact with discount combination settings",
    "note": "Recorded live Tavily Search + Extract (requests 515542b8… and 9979922b…, 2026-10-30), replayed offline. No search runs on this hosted demo.",
    "sources": [
      {
        "id": "S1",
        "title": "Shopify Help Center | Combining discounts",
        "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
        "snippet": "For example, from a manual discount applied to a POS cart, or a unique discount on a draft order. The following discount types always apply to an order, regardless of any combination settings for other discounts on the same order: Custom discounts that are manually applied to an order. For example, a custom discount applied to a POS cart, or a custom discount on a draft order. You must manually configure each discount's combination settings.",
        "publishedDate": null
      },
      {
        "id": "S2",
        "title": "Shopify Help Center | Discount combinations on POS",
        "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts",
        "snippet": "When you process a sale in Shopify POS, you can apply both automatic discounts and discount codes that you've configured in your Shopify admin, as well as custom discounts that are specific to the transaction. Before you can use discount combinations in Shopify POS, you need to set up your discounts in the Shopify admin and configure them to be combinable. Custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions.",
        "publishedDate": null
      },
      {
        "id": "S3",
        "title": "Shopify Help Center | Discounts",
        "url": "https://help.shopify.com/en/manual/discounts",
        "snippet": "# Discounts Offering discounts can be a marketing strategy that you use to drive sales in your Shopify store. To offer discounts, you can create discount codes or set up automatic discounts, or you can alternatively set sale prices for individual products. You can create codes for a monetary value discount, a percentage discount, a buy X get Y discount, or a free shipping discount. Customers can enter discount codes online at checkout, or in person if you're using Shopify POS. You can also create other types of discount by using a third-party app from the Shopify App Store. Some third-party apps let you manage discounts directly in your Shopify admin, or you might need to create your discounts in the app's settings.",
        "publishedDate": null
      }
    ],
    "steps": [
      {
        "op": "search",
        "ok": true,
        "latencyMs": 169,
        "requestId": "515542b8-52d0-4ef4-859a-053ebafcf71e",
        "credits": 2
      },
      {
        "op": "extract",
        "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
        "ok": true,
        "latencyMs": 149,
        "credits": 0,
        "requestId": "9979922b-4628-4755-a47b-3053b1bfc222"
      },
      {
        "op": "extract",
        "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts",
        "ok": true,
        "requestId": "9979922b-4628-4755-a47b-3053b1bfc222"
      }
    ]
  },
  "shopify-discount-native": {
    "query": "Shopify how do automatic discounts and discount codes interact with discount combination settings",
    "note": "Recorded live Tavily Search + Extract (requests 76e93d77… and cf6f9793…, 2026-10-30), replayed offline. No search runs on this hosted demo.",
    "sources": [
      {
        "id": "S1",
        "title": "Shopify Help Center | Combining discounts",
        "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
        "snippet": "You can set up both automatic discounts and discount codes to combine. If an automatic discount isn't applying alongside a customer's discount code, then verify the following settings and limits: Verify combination settings: Ensure both the automatic discount and the discount code are set to combine with each other's class in their Combinations settings. Yes, you can apply both automatic discounts and discount codes to the same cart, as long as each discount is configured to combine with the other discount's class.",
        "publishedDate": null
      }
    ],
    "steps": [
      {
        "op": "search",
        "ok": true,
        "latencyMs": 151,
        "requestId": "76e93d77-4811-4db9-b2ef-519d14353ca3",
        "credits": 2
      },
      {
        "op": "extract",
        "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
        "ok": true,
        "latencyMs": 126,
        "credits": 0,
        "requestId": "cf6f9793-d06d-41a5-b790-42810bb9292c"
      }
    ]
  },
  "usps-shipping": {
    "query": "USPS how are United States package shipping prices determined by weight, dimensions and service",
    "note": "Recorded live Tavily Search + Extract (requests 8fadcea1… and ca2d8d4e…, 2026-10-30), replayed offline. No search runs on this hosted demo.",
    "sources": [
      {
        "id": "S1",
        "title": "Mail & Shipping Services | USPS",
        "url": "https://www.usps.com/ship/mail-shipping-services.htm",
        "snippet": "Tracking and insurance are included, shipping boxes and envelopes are free, and with Priority Mail Flat Rate®, you don't need to weigh shipments 70 lbs and under. Dimensional (DIM) weight rates apply to large, lightweight packages. If you omit or give inaccurate dimensions and/or dont pay the DIM weight rate (when it applies), you'll pay a dimension-noncompliance fee of $3.00.",
        "publishedDate": null
      },
      {
        "id": "S2",
        "title": "Priority Mail | USPS",
        "url": "https://www.usps.com/ship/priority-mail.htm",
        "snippet": "Except for Priority Mail Flat Rate packaging, Priority Mail prices are based on weight and zone. Additional Fees: If you give inaccurate dimensions and/or don’t pay the DIM weight rate (when it applies), you’ll pay a dimension-noncompliance fee. Prices are commercial rates based on weight and zone to quickly move your mailings at a reasonable cost.",
        "publishedDate": null
      },
      {
        "id": "S3",
        "title": "Parcel Size, Weight & Fee Standards",
        "url": "https://faq.usps.com/s/article/Parcel-Size-Weight-Fee-Standards",
        "snippet": "Shape, weight, and size affect the price for large packages. · The U.S. Postal Service™ recommends that you use a scale to determine the weight of your package.",
        "publishedDate": null
      }
    ],
    "steps": [
      {
        "op": "search",
        "ok": true,
        "latencyMs": 3900,
        "requestId": "8fadcea1-69d2-451a-9ab3-77135eeb8254",
        "credits": 2
      },
      {
        "op": "extract",
        "url": "https://www.usps.com/ship/mail-shipping-services.htm",
        "ok": true,
        "latencyMs": 70,
        "credits": 0,
        "requestId": "ca2d8d4e-1993-4f8c-9bdf-f0de542f23c7"
      },
      {
        "op": "extract",
        "url": "https://www.usps.com/ship/priority-mail.htm",
        "ok": true,
        "requestId": "ca2d8d4e-1993-4f8c-9bdf-f0de542f23c7"
      }
    ]
  }
};
/** Operative sentences reviewed on 2026-10-30 (hashes of the recorded live Extract passages). */
export const REVIEWED_OPERATIVE_SENTENCES: { url: string; origin: NonNullable<ResearchContext['discountOrigin']>; sha256: string; reviewedAt: string }[] = [
  {
    "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
    "origin": "manual",
    "sha256": "94c0952b67f6714848f4f754ce562467078aa5ca606b2eaa4901bf48fc7e8477",
    "reviewedAt": "2026-10-30"
  },
  {
    "url": "https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts",
    "origin": "manual",
    "sha256": "2540e52d57b71bf11e3525e4da127c05a8a6c551c3d87baf665376b1efe26cf0",
    "reviewedAt": "2026-10-30"
  },
  {
    "url": "https://help.shopify.com/en/manual/discounts/discount-combinations",
    "origin": "native",
    "sha256": "69e663eb5ba8085bf0126539c7a86e36b84051239de738bc5da938c2c145fedb",
    "reviewedAt": "2026-10-30"
  }
];
// Every non-native Shopify origin replays the manual run. For unknown, app and
// (retired) Scripts origins decidePolicy holds on the origin alone, so the same
// evidence shows that only the origin changed the decision.
const recordedKey = (kind: IssueKind, c: ResearchContext) => kind === 'discount' && c.platform === 'Shopify' ? c.discountOrigin === 'native' ? 'shopify-discount-native' as const : 'shopify-discount-manual' as const : kind === 'shipping' && c.carrier === 'USPS' ? 'usps-shipping' as const : null;
export function recordedRetrieval(kind: IssueKind, c: ResearchContext): Recorded | undefined {
  const key = recordedKey(kind, c);
  if (!key) return undefined;
  const recorded = RECORDED_RETRIEVALS[key];
  return key === 'shopify-discount-manual' && c.discountOrigin !== 'manual' ? { ...recorded, note: `${recorded.note} This is the recorded run for manual POS/draft-order discounts, reused unchanged for the selected origin; only the origin changes the decision.` } : recorded;
}
// Recorded live Tavily S1 (request 19444728-22d2-4be8-ab7e-7c4d0714bb07, 2026-10-30,
// evidence/live-run-20261030.json). The recorded Nemotron replay in nebius.ts is
// tied to this exact passage; it is no longer the hosted manual fixture.
export const RECORDED_MANUAL_SOURCE = { id: 'S1', title: 'Shopify Help Center | Discount combinations on POS', url: 'https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts', snippet: "Custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions. You can't apply custom line item discounts to a split line item. After you apply a custom line item discount in Shopify POS, additional product discount codes can't be applied to that same item. All automatic discounts and discount codes follow the same combination rules and calculation order as", publishedDate: null, sourceRegion: 'global' } satisfies PolicySource;
// Authored summaries for contexts without a recorded run (WooCommerce discounts, UPS).
// Shopify discounts always replay a recorded run (recordedKey).
function fixtureSources(kind: IssueKind, c: ResearchContext): PolicySource[] {
  const shopify = c.platform === 'Shopify';
  if (kind === 'discount') return [{ id: 'S1', title: 'Coupon management · WooCommerce', url: 'https://woocommerce.com/document/coupon-management/', snippet: 'Saved-source paraphrase: coupon usage restrictions include individual-use controls. Inspect the active coupon’s restrictions and intent.', publishedDate: null, savedAt: '2026-10-27T20:11:32Z', sourceRegion: 'global' }];
  if (kind === 'shipping') return [{ id: 'S1', title: c.carrier === 'USPS' ? 'Mailing & Shipping Prices · USPS' : 'Shipping dimensions and weight · UPS', url: c.carrier === 'USPS' ? 'https://www.usps.com/business/prices.htm' : 'https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight', snippet: 'Fixture summary: actual shipping charges depend on service, package characteristics, and applicable rate terms. Verify the carrier documentation and invoice.', publishedDate: null }];
  return [{ id: 'S1', title: shopify ? 'Returns and exchanges · Shopify Help Center' : 'WooCommerce refunds', url: shopify ? 'https://help.shopify.com/en/manual/fulfillment/managing-orders/returns' : 'https://woocommerce.com/document/woocommerce-refunds/', snippet: 'Fixture summary: refunds and physical returns are distinct operational steps. Review refund records and return handling rather than assuming a product defect.', publishedDate: null }];
}

type Packet = Omit<ResearchPacket, 'researchId'>;
type Searched = { sources: PolicySource[]; requestId: string | null; credits: number | null; latencyMs: number };
async function search(plan: ReturnType<typeof searchPlan>, kind: IssueKind, context: ResearchContext, config: TavilyConfig, request: typeof fetch, base: Pick<Packet, 'kind' | 'context' | 'query'>): Promise<Searched | Packet> {
  const start = performance.now();
  try {
    const response = await request('https://api.tavily.com/search', { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000), body: JSON.stringify({ query: plan.query, topic: 'general', search_depth: 'advanced', chunks_per_source: 3, max_results: 3, include_domains: plan.domains, include_domains_mode: 'restrict', include_answer: false, include_raw_content: false, include_images: false, include_usage: true, auto_parameters: false }) });
    const headerId = response.headers.get('x-request-id');
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Math.min(3600, Number(retry)) : 60;
      const note = response.status === 401 ? 'Tavily authentication failed; check the server API key.' : response.status === 429 ? `Tavily rate limit reached; try again in ${seconds} seconds.` : response.status === 432 ? 'The Tavily search quota for this key is used up.' : response.status === 433 ? 'The Tavily pay-as-you-go cap for this key was reached.' : `Tavily search failed with HTTP ${response.status}.`;
      return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'error', note, ...(response.status === 429 ? { retryAfterSeconds: seconds } : {}), retrieval: { steps: [{ op: 'search', ok: false, latencyMs: Math.round(performance.now() - start), ...(headerId ? { requestId: headerId } : {}), detail: `HTTP ${response.status}` }] } };
    }
    const raw = await boundedJson(response, 200000) as { results: unknown[]; request_id?: unknown; usage?: { credits?: unknown } };
    return { sources: safeSources(raw, kind, context), requestId: headerId || (typeof raw.request_id === 'string' ? raw.request_id : null), credits: typeof raw.usage?.credits === 'number' ? raw.usage.credits : null, latencyMs: Math.round(performance.now() - start) };
  } catch { return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'error', note: 'Tavily search failed, timed out or returned unreadable data.' }; }
}

export async function research(kind: IssueKind, context: ResearchContext, live: boolean, config = tavilySettings(), request: typeof fetch = fetch, hooks: ResearchHooks = {}): Promise<Packet> {
  const plan = searchPlan(kind, context);
  const base = { kind, context, query: plan.query };
  if (context.region !== 'US') return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'no-results', note: 'This demo covers US policy only, so the search was skipped and the recommendation is on hold.' };
  const recorded = live ? undefined : recordedRetrieval(kind, context);
  if (recorded) return { ...base, query: recorded.query, mode: 'fixture', checkedAt: null, sources: recorded.sources.map(s => ({ ...s })), status: 'ok', note: recorded.note, retrieval: { steps: recorded.steps.map(s => ({ ...s })) } };
  if (!live) return { ...base, mode: 'fixture', checkedAt: null, sources: fixtureSources(kind, context), status: 'ok', note: 'Authored summaries of the official pages (not a recorded retrieval), shown offline. No search runs on this hosted demo.' };
  if (!config.enabled || !config.key) return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'error', note: 'Live search runs in local mode with your own Tavily key; this demo replays a recorded result.' };
  const searched = await search(plan, kind, context, config, request, base);
  if ('status' in searched) return searched;
  const { sources } = searched;
  const steps: RetrievalStep[] = [{ op: 'search', ok: true, latencyMs: searched.latencyMs, ...(searched.requestId ? { requestId: searched.requestId } : {}), ...(searched.credits !== null ? { credits: searched.credits } : {}) }];
  const proof = { requestId: searched.requestId, latencyMs: searched.latencyMs, usageCredits: searched.credits };
  if (!sources.length) return { ...base, mode: 'live', checkedAt: new Date().toISOString(), sources, status: 'no-results', note: `Tavily found no relevant passages on ${plan.domains[0]} for this context.`, proof, retrieval: { steps } };
  // Search -> Extract: read the top two screened official pages in full (one call,
  // no retry) and pass complete operative sentences to decidePolicy. A source
  // whose page is not usable keeps its search chunk, and the note says so.
  const targets = sources.slice(0, 2), fromExtract = new Set<string>();
  let detail: string;
  if (!hooks.reserveExtract) detail = 'Extract was not requested; passages are Tavily search chunks.';
  else if (!await hooks.reserveExtract()) { detail = 'The live budget denied the Extract call, so it was not sent; passages are Tavily search chunks.'; steps.push({ op: 'extract', ok: false, detail: 'budget denied; not sent' }); }
  else {
    const extracted = await extractPages(targets.map(s => s.url), config, request);
    targets.forEach((source, n) => {
      const page = extracted.pages.get(source.url);
      const passage = page ? operativeSentences(page, source.title, kind, context) : '';
      if (passage) { source.snippet = passage; fromExtract.add(source.id); }
      const call = n === 0 ? { latencyMs: extracted.latencyMs, ...(extracted.credits !== undefined ? { credits: extracted.credits } : {}) } : {};
      steps.push({ op: 'extract', url: source.url, ok: !!passage, ...call, ...(extracted.requestId ? { requestId: extracted.requestId } : {}), ...(passage ? {} : { detail: page ? 'no operative sentence for this context; search chunk kept' : `Extract ${extracted.failure ?? 'did not return this page'}; search chunk kept` }) });
    });
    const ids = [...fromExtract], chunks = sources.filter(s => !fromExtract.has(s.id)).map(s => s.id);
    detail = ids.length ? `Tavily Extract read ${ids.length} official page${ids.length > 1 ? 's' : ''} in full; ${ids.join(', ')} ${ids.length > 1 ? 'are' : 'is'} complete operative sentences from the page${chunks.length ? `, ${chunks.join(', ')} ${chunks.length > 1 ? 'are' : 'is'} a search chunk` : ''}.` : `Tavily Extract ${extracted.failure ?? 'found no operative sentence'}; passages are Tavily search chunks.`;
  }
  const policyChanged = changedPolicy(sources, fromExtract, kind, context);
  const note = `Live Tavily advanced search of ${plan.domains[0]}, screened for safety. ${detail}${policyChanged ? ` The operative sentences on ${policyChanged.url} differ from the version reviewed ${policyChanged.reviewedAt}; the decision is kept but needs re-review.` : ''}`;
  return { ...base, mode: 'live', checkedAt: new Date().toISOString(), sources, status: 'ok', note, proof, retrieval: { steps }, ...(policyChanged ? { policyChanged } : {}) };
}
