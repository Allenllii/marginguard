import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createApp } from '../server/app.js';
import { createDemoCsv } from '../server/demo.js';

test('local API validates imports, blocks cross-origin POSTs, exposes no keys, and labels fixtures', async () => {
  const server = createApp(true).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin?: string) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(health.headers.get('content-security-policy'));
    const config = await health.json(); assert.equal('key' in config.provider, false);
    const demo = await fetch(base + '/api/demo'); const { analysis } = await demo.json(); assert.equal(analysis.synthetic, true);
    const imported = await post('/api/analyze', { csv: createDemoCsv() }); assert.equal(imported.status, 200); assert.equal((await imported.json()).synthetic, true);
    assert.equal((await post('/api/analyze', { csv: 'invalid' })).status, 422);
    assert.equal((await post('/api/analyze', { csv: createDemoCsv(), extra: true })).status, 422);
    assert.equal((await post('/api/analyze', { csv: createDemoCsv() }, 'https://untrusted.example')).status, 403);
    const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(base + '/api/health', { headers: { Host: 'untrusted.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(wrongHost, 403);
    const brief = await post('/api/explain', { csv: createDemoCsv(), live: false }); assert.equal((await brief.json()).mode, 'fixture');
    assert.equal((await post('/api/analyze', { csv: 'x'.repeat(2300000) })).status, 413);
    assert.equal((await fetch(base + '/api/no-route')).status, 404);
    const searched = await post('/api/research', { kind: 'discount', context: { platform: 'Shopify', carrier: 'USPS', region: 'US' }, live: false });
    const packet = await searched.json(); assert.equal(packet.mode, 'fixture');
    assert.equal(packet.checkedAt, null);
    const remediation = await post('/api/remediate', { csv: createDemoCsv(), issueId: 'discount-stacking', researchId: packet.researchId, live: false });
    assert.equal((await remediation.json()).mode, 'fixture');
    assert.equal((await post('/api/remediate', { csv: createDemoCsv(), issueId: 'shipping-overrun', researchId: packet.researchId, live: false })).status, 422);
    assert.equal((await post('/api/research', { kind: 'returns', context: { platform: 'Shopify', carrier: 'USPS', region: 'US' }, live: false })).status, 422);
    assert.equal((await post('/api/research', { kind: 'discount', context: { platform: 'Unknown', carrier: 'USPS', region: 'US' }, live: false })).status, 422);
  } finally { server.close(); }
});
