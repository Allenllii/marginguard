import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { remediate, validateRemediation } from '../server/nebius.js';
import type { ResearchPacket } from '../shared/types.js';
import { permittedPolicyStatements } from '../server/policy-draft.js';

// Authored reproduction of the observed failure shapes, not a copied policy.
const snippet = 'Manual POS discounts always apply regardless of combination settings. Staff can enter an intentional manual adjustment at checkout. A reviewer must confirm the transaction origin and applicable store terms before changing settings. The passage describes an exception to the initial settings hypothesis, not the cause of a particular order anomaly.';
const packet: ResearchPacket = { researchId: 'synthetic-policy-prose-regression', kind: 'discount', mode: 'live', status: 'ok', context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' }, query: 'Synthetic policy prose regression', checkedAt: null, note: 'Authored fixture; no retrieval occurred.', sources: [{ id: 'S1', title: 'Synthetic exception passage', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', snippet, sourceRegion: 'global', publishedDate: null }] };
const statement = 'The returned passage describes a manual-discount exception to combination settings.';
const valid = () => ({ documentedPolicy: [{ sourceId: 'S1', statement }], inference: 'A combination-settings change is not established as a remedy for a manual-origin discount.', nextStep: 'Compare one flagged promotion with the staff override record and confirm whether the adjustment was intentional.', uncertainty: 'Confirm the transaction scope, store eligibility and effective policy; the excerpt does not establish the anomaly cause.' });

test('observed long copied policy passage is rejected even with a valid source ID and stop finish', () => {
  assert.throws(() => validateRemediation({ ...valid(), documentedPolicy: [{ sourceId: 'S1', statement: snippet }] }, packet));
});

test('observed policy fragment ending in a dangling clause is rejected instead of displayed or silently trimmed', () => {
  assert.throws(() => validateRemediation({ ...valid(), documentedPolicy: [{ sourceId: 'S1', statement: 'Manual discounts follow the combination exception as' }] }, packet));
});

test('source membership cannot authorize a new unsupported policy claim', () => {
  assert.throws(() => validateRemediation({ ...valid(), documentedPolicy: [{ sourceId: 'S1', statement: 'All store promotions require a settings change before any manual discount can apply.' }] }, packet));
});

test('controlled complete policy statements accept harmless punctuation differences', () => {
  for (const text of [statement, statement.slice(0, -1), '  ' + statement + '  ']) {
    assert.doesNotThrow(() => validateRemediation({ ...valid(), documentedPolicy: [{ sourceId: 'S1', statement: text }] }, packet));
  }
  assert.doesNotThrow(() => validateRemediation({ ...valid(), nextStep: 'Confirm which promotion class the order belongs to' }, packet));
});

test('model can cite a supporting source without regenerating the code-owned policy sentence', () => {
  const result = validateRemediation({ ...valid(), documentedPolicy: [{ sourceId: 'S1' }] }, packet);
  assert.deepEqual(result.documentedPolicy, [{ sourceId: 'S1', statement }]);
});

test('dangling analyst clauses and long source copying in analyst fields fail closed', () => {
  for (const field of ['inference', 'nextStep', 'uncertainty'] as const) {
    assert.throws(() => validateRemediation({ ...valid(), [field]: 'Review the originating promotion because' }, packet));
    assert.throws(() => validateRemediation({ ...valid(), [field]: snippet }, packet));
  }
});

test('invalid prose causes visible fixture fallback with no live-success proof and no repair request', async () => {
  const issue = analyze(createDemoCsv()).issues.find(item => item.kind === 'discount')!;
  let calls = 0;
  const result = await remediate(issue, packet, true, { enabled: true, key: 'mock-key', model: 'nvidia/mock' }, (async (_url, init) => {
    calls++;
    const body = init?.body ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...valid(), nextStep: 'Review the promotion because' }) } }] } : { data: [{ id: 'nvidia/mock' }] };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch);
  assert.equal(calls, 2);
  assert.equal(result.mode, 'fixture'); assert.equal(result.proof, undefined); assert.ok(result.fallbackReason);
  assert.ok(!result.documentedPolicy.some(item => item.statement.includes(snippet)));
});

test('unknown origin, wrong region and negated exception cannot acquire a policy-backed model draft', async () => {
  const issue = analyze(createDemoCsv()).issues.find(item => item.kind === 'discount')!;
  const never = (() => { throw Error('Unexpected request'); }) as typeof fetch;
  for (const candidate of [
    { ...packet, context: { ...packet.context, discountOrigin: 'unknown' as const } },
    { ...packet, context: { ...packet.context, region: 'UK' as const } },
    { ...packet, sources: [{ ...packet.sources[0], snippet: 'Manual POS discounts cannot bypass combination settings.' }] },
  ]) {
    assert.equal((await remediate(issue, candidate, true, { enabled: true, key: 'mock-key', model: 'nvidia/mock' }, never)).mode, 'fixture');
  }
});

test('policy scope statements stay within each supported context and hold for absent or conflicting evidence', () => {
  const app = { ...packet, context: { ...packet.context, discountOrigin: 'app-script' as const }, sources: [{ ...packet.sources[0], snippet: 'App and script discounts can bypass combination settings.' }] };
  const native = { ...packet, context: { ...packet.context, discountOrigin: 'native' as const }, sources: [{ ...packet.sources[0], snippet: 'Combination settings control eligible code discount classes.' }] };
  const shipping = { ...packet, kind: 'shipping' as const, sources: [{ ...packet.sources[0], snippet: 'Carrier rate rules depend on measured dimensions and billable weight.' }] };
  assert.match(permittedPolicyStatements(app)[0].statement, /app or script exception/);
  assert.match(permittedPolicyStatements(native)[0].statement, /conditions for combining discounts/);
  assert.match(permittedPolicyStatements(shipping)[0].statement, /carrier measurement/);
  assert.deepEqual(permittedPolicyStatements({ ...packet, sources: [] }), []);
  assert.deepEqual(permittedPolicyStatements({ ...packet, sources: [{ ...packet.sources[0], snippet: 'Manual discounts can bypass combination settings. Manual discounts cannot bypass combination settings.' }] }), []);
});

test('duplicate citations and copied text in other fields cannot masquerade as useful synthesis', () => {
  assert.throws(() => validateRemediation({ ...valid(), documentedPolicy: [...valid().documentedPolicy, ...valid().documentedPolicy] }, packet));
  assert.throws(() => validateRemediation({ ...valid(), nextStep: 'A copied lead-in: ' + snippet }, packet));
});

test('observed singular determiner with plural accounts is rejected without changing model prose', () => {
  for (const text of ['The policy does not confirm eligibility for this specific accounts.', 'Verify the terms for this accounts before acting.', 'The rule may differ for these specific account.']) {
    assert.throws(() => validateRemediation({ ...valid(), inference: text }, packet));
  }
});

test('correct singular and plural account phrasing remains accepted', () => {
  for (const text of ['The policy does not confirm eligibility for this specific account.', 'The policy may differ for these specific accounts.', 'Verify the selected store and its account terms before acting.']) {
    assert.doesNotThrow(() => validateRemediation({ ...valid(), inference: text }, packet));
  }
});

test('observed agreement error returns complete offline checks without a live proof or repair request', async () => {
  const issue = analyze(createDemoCsv()).issues.find(item => item.kind === 'discount')!;
  let calls = 0;
  const result = await remediate(issue, packet, true, { enabled: true, key: 'mock-key', model: 'nvidia/mock' }, (async (_url, init) => {
    calls++;
    const body = init?.body ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ ...valid(), inference: 'The policy does not confirm eligibility for this specific accounts.' }) } }] } : { data: [{ id: 'nvidia/mock' }] };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch);
  assert.equal(calls, 2); assert.equal(result.mode, 'fixture'); assert.equal(result.proof, undefined);
  assert.ok(!JSON.stringify(result).includes('this specific accounts'));
});
