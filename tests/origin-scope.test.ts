import test from 'node:test';
import assert from 'node:assert/strict';
import { decidePolicy } from '../shared/policy-decision.js';
import { permittedPolicyStatements } from '../server/policy-draft.js';
import { research } from '../server/tavily.js';
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
test('explicit Scripts API origin uses only a matching Scripts API passage', () => {
  const p = packet('scripts-api' as ResearchContext['discountOrigin']);
  assert.equal(decidePolicy('discount', p).status, 'contradicted');
  assert.match(permittedPolicyStatements(p)[0].statement, /Scripts API exception/);
  p.sources[0].snippet = 'An ordinary app discount can bypass combination settings according to this synthetic claim.';
  assert.equal(decidePolicy('discount', p).status, 'hold');
});
test('offline ordinary app fixture holds without asserting the Scripts API exception applies to it', async () => {
  const p = await research('discount', { ...context, discountOrigin: 'app' as ResearchContext['discountOrigin'] }, false, {}, (() => { throw Error('No provider'); }) as typeof fetch);
  assert.equal(decidePolicy('discount', p).status, 'hold');
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
