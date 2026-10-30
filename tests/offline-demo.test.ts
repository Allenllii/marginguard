import test from 'node:test';
import assert from 'node:assert/strict';
import offline from '../worker/offline-entry.js';

const base = 'https://judge-demo.example';
const hostileRuntime = new Proxy({}, { get() { throw Error('Offline wrapper must not read runtime configuration or secrets'); }, ownKeys() { throw Error('Offline wrapper must not enumerate runtime configuration'); } });
const request = (path: string, body?: unknown) => new Request(base + path, body ? { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});

test('offline judge entry ignores runtime credentials, flags and database bindings', async () => {
  const health = await (await offline.fetch(request('/api/health'), hostileRuntime)).json();
  assert.equal(health.provider.mode, 'fixture'); assert.equal(health.tavily.mode, 'fixture');
  assert.equal(health.limits.liveSafe, false); assert.equal(health.limits.scope, 'process lifetime');
});

test('offline judge entry supports deterministic import and fixture evidence without any outbound request', async () => {
  const previous = globalThis.fetch; let outbound = 0;
  globalThis.fetch = (async () => { outbound++; throw Error('No outbound request allowed'); }) as typeof fetch;
  try {
    const demo = await (await offline.fetch(request('/api/demo'), hostileRuntime)).json();
    assert.equal(demo.analysis.orders.length, 504); assert.equal(demo.analysis.totals.opportunity, 191858);
    assert.equal((await (await offline.fetch(request('/api/analyze', { csv: demo.csv }), hostileRuntime)).json()).totals.revenue, 3984622);
    const context = { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' };
    const denied = await (await offline.fetch(request('/api/research', { kind: 'discount', context, live: true }), hostileRuntime)).json();
    assert.equal(denied.mode, 'fixture'); assert.equal(denied.proof, undefined); assert.equal(denied.sources.length, 0);
    const packet = await (await offline.fetch(request('/api/research', { kind: 'discount', context, live: false }), hostileRuntime)).json();
    assert.equal(packet.mode, 'fixture'); assert.equal(packet.checkedAt, null); assert.equal(packet.proof, undefined); assert.match(packet.note, /^Recorded live Tavily Search \+ Extract/); assert.deepEqual(packet.retrieval.steps.map((step: { op: string }) => step.op), ['search', 'extract', 'extract']);
    const result = await (await offline.fetch(request('/api/remediate', { csv: demo.csv, issueId: 'discount-stacking', researchId: packet.researchId, live: true }), hostileRuntime)).json();
    assert.equal(result.mode, 'fixture'); assert.equal(result.proof, undefined); assert.match(result.nextStep, /Audit staff\/manual POS/);
    assert.equal(outbound, 0);
  } finally { globalThis.fetch = previous; }
});

test('offline judge entry preserves same-origin POST protection', async () => {
  const response = await offline.fetch(new Request(base + '/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), hostileRuntime);
  assert.equal(response.status, 403);
});
