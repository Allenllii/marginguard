import { z } from 'zod';
import type { IssueKind, PolicySource, ResearchContext, ResearchPacket } from '../shared/types.js';
import { boundedJson } from './http.js';
import { inferredSourceRegion, unresolvedPolicyStatement } from '../shared/policy-source-scope.js';

export const ContextSchema = z.object({ platform: z.enum(['Shopify', 'WooCommerce']), carrier: z.enum(['USPS', 'UPS']), region: z.enum(['US', 'UK', 'unknown']), discountOrigin: z.enum(['native', 'manual', 'scripts-api', 'app', 'app-script', 'unknown']).default('unknown') }).strict();
export const KindSchema = z.enum(['discount', 'shipping']);
export type TavilyConfig = { key?: string; enabled?: boolean };
export function tavilySettings(): TavilyConfig { return { key: process.env.TAVILY_API_KEY, enabled: process.env.TAVILY_ENABLE_LIVE === 'true' }; }
export function tavilyStatus(c = tavilySettings()) { return { mode: c.enabled && c.key ? 'configured' : 'fixture', endpoint: 'https://api.tavily.com/search' }; }
export function searchPlan(kind: IssueKind, context: ResearchContext) {
  ContextSchema.parse(context); KindSchema.parse(kind);
  const domain = kind === 'shipping' ? context.carrier === 'USPS' ? 'usps.com' : 'ups.com' : context.platform === 'Shopify' ? 'help.shopify.com' : 'woocommerce.com';
  const origin = context.discountOrigin === 'manual' ? 'manual POS draft order discounts bypass combination settings exceptions' : context.discountOrigin === 'scripts-api' ? 'Scripts API discounts bypass combination settings exceptions' : context.discountOrigin === 'app' || context.discountOrigin === 'app-script' ? 'app discount application method combination eligibility settings' : 'automatic code discount combination eligibility settings';
  const query = kind === 'shipping' ? `${context.carrier} United States official shipping dimensional weight surcharges package dimensions policy` : `${context.platform} official documentation ${origin}`;
  return { query, domains: [domain], relevant: kind === 'shipping' ? /shipping|package|dimensional|postage|surcharge|weight|rates/i : kind === 'discount' ? /discount|coupon|promotion|combin/i : /return|refund|exchange/i };
}
const cleanText = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
export function selectPassage(content: string, kind: IssueKind, context: ResearchContext): string {
  const terms = kind === 'shipping' ? ['dimension', 'weight', 'surcharge', 'measure', 'rate', 'service'] : context.discountOrigin === 'manual' ? ['manual', 'draft', 'pos', 'bypass', 'regardless', 'always apply'] : context.discountOrigin === 'scripts-api' ? ['scripts api', 'bypass', 'regardless', 'always apply'] : ['combination settings', 'combin', 'eligible', 'restriction', 'individual use'];
  const words = cleanText(content).split(/\s+/), starts = new Set<number>([0]);
  words.forEach((word, i) => { if (terms.some(t => word.toLowerCase().includes(t.split(' ')[0]))) starts.add(Math.max(0, i - 12)); });
  const best = [...starts].map(start => { const text = words.slice(start, start + 70).join(' '); return { text, start, score: terms.reduce((s, t) => s + (text.toLowerCase().includes(t) ? 1 : 0), 0) }; }).sort((a, b) => b.score - a.score || a.start - b.start)[0];
  return (best?.text ?? '').slice(0, 1200);
}
export function safeSources(raw: unknown, kind: IssueKind, context: ResearchContext): PolicySource[] {
  const parsed = z.object({ results: z.array(z.object({ title: z.string().max(2000), url: z.string().max(2048), content: z.string().max(30000).default(''), score: z.number().optional(), published_date: z.string().nullable().optional() })).max(20) }).parse(raw);
  const plan = searchPlan(kind, context), seen = new Set<string>();
  const accepted: PolicySource[] = [];
  for (const item of parsed.results) {
    let url: URL; try { url = new URL(item.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !plan.domains.some(d => url.hostname === d || url.hostname.endsWith(`.${d}`))) continue;
    if (!plan.relevant.test(item.title + ' ' + item.content) || (item.score !== undefined && item.score < 0.25)) continue;
    const content = cleanText(item.content);
    if (!content || /ignore.{0,30}(instructions|previous)|system prompt|api.?key|execute.{0,20}(code|command)|send.{0,20}(secret|credential)|you are (chatgpt|an assistant)/i.test(content)) continue;
    if (seen.has(url.href)) continue; seen.add(url.href);
    if (!plan.relevant.test(content) || content.length < 40) continue;
    // Inspect the complete returned text before selecting a short passage, so
    // truncation cannot discard an expiry or known contrary rule.
    if (unresolvedPolicyStatement(item.title, content)) continue;
    accepted.push({ id: `S${accepted.length + 1}`, title: cleanText(item.title).slice(0, 180), url: url.href, snippet: selectPassage(item.content, kind, context), publishedDate: item.published_date ? cleanText(item.published_date).slice(0, 40) : null, sourceRegion: inferredSourceRegion(item.title, content) });
    if (accepted.length === 3) break;
  }
  return accepted;
}
function fixtureSources(kind: IssueKind, c: ResearchContext): PolicySource[] {
  const shopify = c.platform === 'Shopify';
  if (kind === 'discount') return [{ id: 'S1', title: shopify ? 'Combining discounts · Shopify Help Center' : 'Coupon management · WooCommerce', url: shopify ? 'https://help.shopify.com/en/manual/discounts/discount-combinations' : 'https://woocommerce.com/document/coupon-management/', snippet: shopify ? c.discountOrigin === 'manual' || c.discountOrigin === 'scripts-api' ? 'Saved-source paraphrase: Shopify lists manual POS/draft-order discounts and Scripts API discounts as exceptions that apply regardless of combination settings. Review the originating override or script; a combination-settings change is not established as a fix.' : 'Saved-source paraphrase: eligible discount classes can combine when the relevant settings permit it. Confirm store eligibility and active code/automatic-discount configuration.' : 'Saved-source paraphrase: coupon usage restrictions include individual-use controls. Inspect the active coupon’s restrictions and intent.', publishedDate: null, savedAt: '2026-10-27T20:11:32Z', sourceRegion: 'global' }];
  if (kind === 'shipping') return [{ id: 'S1', title: c.carrier === 'USPS' ? 'Mailing & Shipping Prices · USPS' : 'Shipping dimensions and weight · UPS', url: c.carrier === 'USPS' ? 'https://www.usps.com/business/prices.htm' : 'https://www.ups.com/us/en/support/shipping-support/shipping-dimensions-weight', snippet: 'Fixture summary: actual shipping charges depend on service, package characteristics, and applicable rate terms. Verify the carrier documentation and invoice.', publishedDate: null }];
  return [{ id: 'S1', title: shopify ? 'Returns and exchanges · Shopify Help Center' : 'WooCommerce refunds', url: shopify ? 'https://help.shopify.com/en/manual/fulfillment/managing-orders/returns' : 'https://woocommerce.com/document/woocommerce-refunds/', snippet: 'Fixture summary: refunds and physical returns are distinct operational steps. Review refund records and return handling rather than assuming a product defect.', publishedDate: null }];
}
export async function research(kind: IssueKind, context: ResearchContext, live: boolean, config = tavilySettings(), request: typeof fetch = fetch): Promise<Omit<ResearchPacket, 'researchId'>> {
  const plan = searchPlan(kind, context);
  const base = { kind, context, query: plan.query };
  if (context.region !== 'US') return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'no-results', note: 'Region applicability is unconfirmed or outside the US demo scope. Hold the recommendation; no search or model request was made.' };
  if (!live) return { ...base, mode: 'fixture', checkedAt: null, sources: fixtureSources(kind, context), status: 'ok', note: 'Offline source fixtures with authored summaries and reference URLs. No Tavily call; these are not current search results.' };
  if (!config.enabled || !config.key) return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'error', note: 'Live Tavily search is not enabled or its server API key is missing. No current-policy result is claimed.' };
  const start = performance.now();
  try {
    const response = await request('https://api.tavily.com/search', { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20000), body: JSON.stringify({ query: plan.query, topic: 'general', search_depth: 'basic', max_results: 3, include_domains: plan.domains, include_domains_mode: 'restrict', include_answer: false, include_raw_content: false, include_images: false, include_usage: true, auto_parameters: false }) });
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const seconds = retry && /^\d+$/.test(retry) ? Math.min(3600, Number(retry)) : 60;
      const note = response.status === 401 ? 'Tavily authentication failed. Check the approved server credential.' : response.status === 429 ? `Tavily rate limit reached. Wait at least ${seconds} seconds before retrying; no automatic retry was made.` : response.status === 432 ? 'Tavily search quota is exhausted. No result or current-policy evidence is claimed.' : response.status === 433 ? 'Tavily pay-as-you-go cap was reached. No payment or retry was attempted.' : 'Tavily request failed. No current-policy evidence is claimed.';
      return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'error', note, ...(response.status === 429 ? { retryAfterSeconds: seconds } : {}) };
    }
    const raw = await boundedJson(response, 200000) as { results: unknown[]; request_id?: unknown; usage?: { credits?: unknown } };
    const sources = safeSources(raw, kind, context);
    return { ...base, mode: 'live', checkedAt: new Date().toISOString(), sources, status: sources.length ? 'ok' : 'no-results', note: sources.length ? 'Retrieved by Tavily. Official-domain results are screened for relevance; snippets are untrusted evidence, not proof of the cause of a CSV anomaly. Verify the full policy and effective date.' : 'Tavily returned no relevant safe official sources. Broaden the supported context or inspect official documentation manually; no policy-backed remediation is generated.', proof: { requestId: response.headers.get('x-request-id') || (typeof raw.request_id === 'string' ? raw.request_id : null), latencyMs: Math.round(performance.now() - start), usageCredits: typeof raw.usage?.credits === 'number' ? raw.usage.credits : null } };
  } catch { return { ...base, mode: 'fixture', checkedAt: null, sources: [], status: 'error', note: 'Tavily request failed, timed out, or returned invalid data. No live success or current-policy evidence is claimed.' }; }
}
