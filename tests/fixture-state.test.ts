import test from 'node:test';
import assert from 'node:assert/strict';
import { createService } from '../server/service.js';
import { createDemoCsv } from '../server/demo.js';
import type { ResearchPacket } from '../shared/types.js';
import { fixtureReference, parseFixtureReference } from '../server/fixture-reference.js';

const context = { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' } as const;
const env = { PUBLIC_DEMO: 'true', NEBIUS_ENABLE_LIVE: 'false', TAVILY_ENABLE_LIVE: 'false', PROVIDER_HARD_CAPS_VERIFIED: 'false' };
const never = (() => { throw Error('Fixture reconstruction must not call a provider'); }) as typeof fetch;

test('saved-source fixture can be drafted by a different cold service instance without a database', async () => {
  const first = createService({ env, request: never });
  const packet = (await first.dispatch('POST', '/api/research', { kind: 'discount', context, live: false })).body as ResearchPacket;
  assert.equal(packet.mode, 'fixture'); assert.equal(packet.checkedAt, null);
  const cold = createService({ env, request: never });
  const reply = await cold.dispatch('POST', '/api/remediate', { csv: createDemoCsv(), issueId: 'discount-stacking', researchId: packet.researchId, live: false });
  assert.equal(reply.status, 200);
  const result = reply.body as { mode: string; proof?: unknown; nextStep: string };
  assert.equal(result.mode, 'fixture'); assert.equal(result.proof, undefined); assert.match(result.nextStep, /Audit staff\/manual POS/);
});
test('fixture references accept only complete enumerated context, never source text', () => {
  const id = fixtureReference('discount', context);
  assert.deepEqual(parseFixtureReference(id), { kind: 'discount', context });
  for (const bad of [id + ':extra', id.replace(':US:', ':CA:'), id.replace('discount:', 'returns:'), id.replace(':manual', ':<script>'), 'fixture-v1:discount:Shopify:USPS:US', 'x'.repeat(161)]) assert.equal(parseFixtureReference(bad), null);
});
test('reconstructed fixtures cannot acquire live proof or call a configured provider', async () => {
  const cold = createService({ env: { ...env, NEBIUS_API_KEY: 'mock-key', NEBIUS_ENABLE_LIVE: 'true' }, request: never });
  const reply = await cold.dispatch('POST', '/api/remediate', { csv: createDemoCsv(), issueId: 'discount-stacking', researchId: fixtureReference('discount', context), live: true });
  assert.equal(reply.status, 200);
  assert.equal((reply.body as ResearchPacket).mode, 'fixture'); assert.equal((reply.body as ResearchPacket).proof, undefined);
});
test('cold fixture reconstruction preserves kind mismatch and region hold', async () => {
  const cold = createService({ env, request: never });
  for (const researchId of [fixtureReference('shipping', context), fixtureReference('discount', { ...context, region: 'UK' })]) {
    const reply = await cold.dispatch('POST', '/api/remediate', { csv: createDemoCsv(), issueId: 'discount-stacking', researchId, live: false });
    assert.equal(reply.status, 422);
  }
});

test('a missing live research UUID remains rejected by a cold instance without provider requests', async () => {
  const cold = createService({ env, request: never });
  const reply = await cold.dispatch('POST', '/api/remediate', { csv: createDemoCsv(), issueId: 'discount-stacking', researchId: 'e866e704-9cc2-4e25-88be-8780f738db14', live: true });
  assert.equal(reply.status, 422);
});
