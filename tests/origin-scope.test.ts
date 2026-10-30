import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePolicy } from '../shared/policy-decision.js';
import { permittedPolicyStatements } from '../server/policy-draft.js';
import { research } from '../server/tavily.js';
import { remediate } from '../server/nebius.js';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import type { ResearchContext, ResearchPacket } from '../shared/types.js';
const context: ResearchContext = { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'app-script' };
const passage = 'Shopify Scripts API discounts can bypass combination settings and apply regardless of those settings.';
function packet(origin: ResearchContext['discountOrigin']): ResearchPacket {
  return { kind: 'discount', context: { ...context, discountOrigin: origin }, researchId: 'test', mode: 'fixture', status: 'ok', checkedAt: null, query: 'synthetic', note: 'Authored fixture', sources: [{ id: 'S1', title: 'Scripts API exception', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', snippet: passage, publishedDate: null }] };
}
test('legacy combined app-script origin holds because the discount mechanism is ambiguous', () => {
  assert.equal(decidePolicy('discount', packet('app-script')).status, 'hold');
  assert.deepEqual(permittedPolicyStatements(packet('app-script')), []);
});
test('generic app origin cannot inherit a Scripts API exception', () => {
  assert.equal(decidePolicy('discount', packet('app' as ResearchContext['discountOrigin'])).status, 'hold');
  assert.deepEqual(permittedPolicyStatements(packet('app' as ResearchContext['discountOrigin'])), []);
});
test('Shopify Scripts origin holds even on a matching Scripts exception passage, because Scripts were retired', () => {
  const p = packet('scripts-api');
  for (const snippet of [passage, 'An ordinary app discount can bypass combination settings according to this synthetic claim.', 'Scripts API discounts can bypass combination settings. Scripts API discounts can never bypass combination settings.']) {
    p.sources[0].snippet = snippet;
    const decision = decidePolicy('discount', p);
    assert.equal(decision.status, 'hold', snippet); assert.deepEqual(decision.sourceIds, []);
    assert.equal(decision.constraint, 'Shopify Scripts were retired on June 30, 2026; check whether the discount now comes from a Shopify Function or app, then retrieve that mechanism’s policy.');
    assert.match(decision.nextCheck, /Shopify Function or an app/);
    assert.deepEqual(permittedPolicyStatements(p), []);
  }
  // Region and injection screens still come first.
  assert.match(decidePolicy('discount', { ...p, context: { ...p.context, region: 'UK' } }).constraint, /Region applicability/);
});

// --- Offline origin selection: same recorded evidence, different origin ----
const noProvider = (() => { throw Error('No provider'); }) as typeof fetch;
const offline = async (discountOrigin: ResearchContext['discountOrigin']) => ({ ...await research('discount', { ...context, discountOrigin }, false, {}, noProvider), researchId: 'test' }) as ResearchPacket;
test('offline Shopify unknown, app and Scripts origins reuse the recorded manual Search + Extract packet and hold on the origin alone', async () => {
  const manual = await offline('manual');
  assert.equal(decidePolicy('discount', manual).status, 'contradicted');
  const holds = { unknown: /Identify the discount origin/, app: /app discount application mechanism/, 'app-script': /app discount application mechanism/, 'scripts-api': /Shopify Function or an app/ } as const;
  for (const [origin, nextCheck] of Object.entries(holds) as [NonNullable<ResearchContext['discountOrigin']>, RegExp][]) {
    const p = await offline(origin);
    assert.equal(p.mode, 'fixture'); assert.equal(p.checkedAt, null); assert.equal(p.proof, undefined); assert.equal(p.status, 'ok');
    assert.equal(p.context.discountOrigin, origin);
    assert.deepEqual(p.sources, manual.sources, origin); assert.deepEqual(p.retrieval, manual.retrieval, origin); assert.equal(p.query, manual.query, origin);
    assert.ok(p.note.startsWith(manual.note), origin);
    assert.match(p.note, /recorded run for manual POS\/draft-order discounts, reused unchanged for the selected origin/);
    const decision = decidePolicy('discount', p);
    assert.equal(decision.status, 'hold', origin); assert.match(decision.nextCheck, nextCheck, origin); assert.deepEqual(decision.sourceIds, []);
    // The recorded Nemotron draft is for the manual decision; a held origin gets the rule-based checks.
    assert.equal((await remediate(analyze(createDemoCsv()).issues.find(i => i.kind === 'discount')!, p, false, {}, noProvider)).model, null, origin);
  }
  assert.doesNotMatch(manual.note, /reused/);
});
test('offline native keeps its own recorded packet and WooCommerce keeps its labelled authored summary', async () => {
  const native = await offline('native');
  assert.equal(native.sources.length, 1); assert.match(native.note, /^Recorded live Tavily Search \+ Extract \(requests 76e93d77…/); assert.doesNotMatch(native.note, /reused/);
  assert.equal(decidePolicy('discount', native).status, 'review');
  const woo = await research('discount', { ...context, platform: 'WooCommerce', discountOrigin: 'unknown' }, false, {}, noProvider);
  assert.match(woo.note, /^Authored summaries/); assert.equal(woo.retrieval, undefined); assert.equal(decidePolicy('discount', woo).status, 'hold');
  for (const s of [...native.sources, ...(await offline('manual')).sources]) assert.doesNotMatch(s.snippet, /Scripts/);
});

test('manual exception is judged per sentence and only for Shopify', () => {
  const url = 'https://help.shopify.com/en/manual/discounts/discount-combinations';
  const ctx = { platform: 'Shopify' as const, carrier: 'USPS' as const, region: 'US' as const, discountOrigin: 'manual' as const };
  const one = (snippet: string, platform: 'Shopify' | 'WooCommerce' = 'Shopify') => decidePolicy('discount', { context: { ...ctx, platform }, status: 'ok', sources: [{ id: 'S1', title: 'Policy', url, snippet, publishedDate: null }] }).status;
  const live = 'Custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions. You can\'t apply custom line item discounts to a split line item.';
  assert.equal(one(live), 'contradicted');
  assert.equal(one('Manual discounts follow combination settings. Scripts API discounts apply regardless of combination settings.'), 'hold');
  assert.equal(one('Manual POS discounts always apply only if the staff member has permission.'), 'hold');
  assert.equal(one('Do manual POS discounts always apply regardless of combination settings?'), 'hold');
  assert.equal(one(live, 'WooCommerce'), 'hold');
});

test('ordinary coupon prose is not mistaken for a retracted policy, while real retractions still hold', async () => {
  const { unresolvedPolicyStatement } = await import('../shared/policy-source-scope.js');
  // Observed on woocommerce.com/document/coupon-management (Tavily request 228a3088…, 2026-10-30).
  assert.equal(unresolvedPolicyStatement('Coupon management', 'Usage limit per coupon — how many times a coupon can be used by all customers before it becomes invalid.'), false);
  for (const text of ['It is not true.', 'That is incorrect.', 'It no longer applies.', 'This policy is outdated.', 'This guidance has expired.']) assert.equal(unresolvedPolicyStatement('', text), true, text);
});

test('shipping review needs a stated pricing mechanism, not a generic word like "rate"', () => {
  const one = (snippet: string, carrier: 'USPS' | 'UPS' = 'USPS') => decidePolicy('shipping', { context: { ...context, carrier }, status: 'ok', sources: [{ id: 'S1', title: 'Carrier policy', url: 'https://www.usps.com/business/prices.htm', snippet, publishedDate: null }] }).status;
  for (const generic of ['Actual shipping charges depend on service, package characteristics, and applicable rate terms.', 'USPS postage prices depend on service and package characteristics. Review the applicable shipping service rate table and actual package measurements.', 'Shape, weight, and size affect the price for large packages.', 'Flat Rate boxes ship at one rate.']) assert.equal(one(generic), 'insufficient', generic);
  for (const mechanism of ['Dimensional (DIM) weight rates apply to large, lightweight packages.', 'UPS bills the greater of actual or billable weight.', 'Packages over the size and weight limits are not accepted.', 'A nonstandard fee applies to long parcels.', 'You will pay a dimension-noncompliance fee.', 'A fuel surcharge applies to every package.', 'Additional Handling charges apply to oversized boxes.']) assert.equal(one(mechanism, 'UPS'), 'review', mechanism);
});

test('recorded USPS replay reaches review on its DIM-weight and noncompliance-fee passages; the UPS summary does not', async () => {
  const noFetch = (() => { throw Error('No provider'); }) as typeof fetch;
  const usps = await research('shipping', context, false, {}, noFetch);
  const decision = decidePolicy('shipping', usps);
  assert.equal(decision.status, 'review');
  assert.deepEqual(decision.sourceIds, ['S1', 'S2']);
  assert.match(decision.disprove, /invoice line.*dimensions and weight.*service level.*contracted rate/);
  assert.doesNotMatch(decision.disprove, /promotion/);
  const ups = await research('shipping', { ...context, carrier: 'UPS' }, false, {}, noFetch);
  assert.equal(decidePolicy('shipping', ups).status, 'insufficient');
  assert.match(decidePolicy('discount', packet('manual')).disprove, /original promotion record/);
});
