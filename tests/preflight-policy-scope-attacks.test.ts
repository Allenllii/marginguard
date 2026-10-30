import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectCombinationRestrictions } from '../server/preflight-policy-scope.js';
import { inferredSourceRegion } from '../shared/policy-source-scope.js';
import { retrievePreflightPolicy } from '../server/preflight-policy.js';

const attacks = [
  'If a customer enters several discount codes at checkout that cannot be combined, then product and order discounts cannot combine under any settings and an error message appears.',
  'Shipping discounts cannot combine with each other, product and order discounts cannot combine even when all settings allow them, because shipping discounts apply to the whole shipping rate.',
  'If you have another discount that allows combinations with product and order discounts, but not when its combination settings permit, then the two discounts cannot combine.',
  'If you have another discount that allows combinations, but not when eligibility is satisfied, then the two discounts cannot combine.',
  'If discounts cannot combine, then the best discount is selected. They cannot combine.',
  'If discounts cannot combine, then the best discount is selected. However, they are not combinable.',
];
for (const [index, value] of attacks.entries()) test(`scope adversary ${index + 1}: unknown text cannot hide a prohibition`, () => {
  assert.equal(inspectCombinationRestrictions(value).unresolvedDenial, true);
});

test('explicit unknown regional restriction wins over a distant US mention', () => {
  assert.equal(inferredSourceRegion('Discount combinations', 'Eligible US merchants can combine discounts when combination settings permit the combination. This guidance is for Maltese stores only.'), 'other');
  assert.equal(inferredSourceRegion('For US stores only', 'Eligible discounts can combine when settings permit.'), 'US');
});

test('regional modifiers before the jurisdiction also exclude a distant US reference', () => {
  for (const clause of ['This guidance is only for Maltese stores.', 'This guidance applies exclusively to Maltese stores.'])
    assert.equal(inferredSourceRegion('Discount combinations', 'Eligible US merchants can combine discounts. ' + clause), 'other');
});

test('eligibility-only merchant restrictions do not invent a geographic region', () => {
  for (const clause of ['Available only to eligible merchants.', 'For eligible merchants only.'])
    assert.equal(inferredSourceRegion('Discount combinations', clause), undefined);
});

test('runtime never clears an unreviewed snapshot, including denial paraphrases', async () => {
  const url = 'https://help.shopify.com/en/manual/discounts/discount-combinations';
  const content = 'Eligible discounts can combine when combination settings permit the combination.';
  for (const tail of ['', ' Product and order discounts are unable to combine.', ' Product and order discounts are not allowed to combine.']) {
    let calls = 0;
    const result = await retrievePreflightPolicy({ enabled: true, key: 'authored-fixture-only' }, (async () => {
      calls++;
      return new Response(JSON.stringify(calls === 1 ? { results: [{ title: 'Combining discounts', url, content }] }
        : { results: [{ url, raw_content: content + tail }], failed_results: [] }));
    }) as typeof fetch);
    assert.equal(result.status, 'HOLD'); assert.equal(result.sources.length, 0); assert.equal(calls, 2);
    assert.match(result.reason, /EXTRACT_SOURCE_REVIEW_REQUIRED/);
  }
});
