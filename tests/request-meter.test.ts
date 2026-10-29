import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestMeter, RequestBudgetExhausted, sanitizeRequestId, serializeEvaluationEvidence } from '../scripts/lib/request-meter.js';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { explain } from '../server/nebius.js';

const modelUrl = 'https://api.tokenfactory.nebius.com/v1/models';
const completionUrl = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
const searchUrl = 'https://api.tavily.com/search';

test('meter counts catalogue and completion as separate HTTP attempts', async () => {
  const meter = createRequestMeter(2, (async () => new Response('{}', { headers: { 'x-request-id': 'fixture-id' } })) as typeof fetch);
  await meter.request(modelUrl);
  await meter.request(completionUrl, { method: 'POST' });
  assert.equal(meter.remaining(), 0);
  assert.deepEqual(meter.snapshot().traces.map(t => t.endpoint), ['models', 'completion']);
  assert.ok(meter.snapshot().traces.every(t => t.status === 200 && t.outcome === 'response' && t.requestId === 'fixture-id'));
  await assert.rejects(meter.request(searchUrl, { method: 'POST' }), RequestBudgetExhausted);
  assert.equal(meter.snapshot().attemptedHttpRequests, 2);
  assert.equal(meter.snapshot().blockedAttempts, 1);
});

test('concurrent requests cannot overshoot the reserved cap', async () => {
  let calls = 0;
  const meter = createRequestMeter(3, (async () => { calls++; return new Response('{}'); }) as typeof fetch);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => meter.request(modelUrl)));
  assert.equal(calls, 3);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal(meter.snapshot().blockedAttempts, 17);
});

test('in-flight reservations stay bounded and detached snapshots do not change after settlement', async () => {
  let settle!: (response: Response) => void;
  let calls = 0;
  const pending = new Promise<Response>(resolve => { settle = resolve; });
  const meter = createRequestMeter(1, (async () => { calls++; return pending; }) as typeof fetch);
  const first = meter.request(modelUrl);
  const before = meter.snapshot();
  assert.equal(before.traces[0].outcome, 'in-flight');
  assert.equal(before.traces[0].responseLatencyMs, null);
  assert.equal(meter.remaining(), 0);
  await assert.rejects(meter.request(modelUrl), RequestBudgetExhausted);
  settle(new Response('{}'));
  await first;
  assert.equal(calls, 1);
  assert.equal(before.traces[0].outcome, 'in-flight');
  assert.equal(meter.snapshot().traces[0].outcome, 'response');
  assert.equal(meter.snapshot().blockedAttempts, 1);
});

test('network errors remain counted and unknown, without leaking headers/body/error text', async () => {
  const secret = 'fixture-private-value-do-not-log';
  const meter = createRequestMeter(1, (async () => { throw new Error(secret); }) as typeof fetch);
  await assert.rejects(meter.request(searchUrl, { method: 'POST', headers: { Authorization: secret }, body: secret }));
  const trace = meter.snapshot();
  assert.equal(trace.unknownOutcomes, 1); assert.equal(trace.attemptedHttpRequests, 1);
  assert.equal(trace.traces[0].status, null);
  assert.ok(!JSON.stringify(trace).includes(secret));
  await assert.rejects(meter.request(modelUrl), RequestBudgetExhausted);
  assert.equal(meter.remaining(), 0);
  assert.equal(meter.snapshot().unknownOutcomes, 1);
  assert.equal(meter.snapshot().blockedAttempts, 1);
});

test('redirect behavior is forced to error for options and inherited Request settings', async () => {
  const redirects: Array<RequestRedirect | undefined> = [];
  const meter = createRequestMeter(2, (async (_input, init) => {
    redirects.push(init?.redirect);
    throw new TypeError('redirect rejected');
  }) as typeof fetch);
  await assert.rejects(meter.request(modelUrl, { redirect: 'follow' }));
  await assert.rejects(meter.request(new Request(modelUrl, { redirect: 'follow' })));
  assert.deepEqual(redirects, ['error', 'error']);
  assert.equal(meter.snapshot().unknownOutcomes, 2);
});

test('exported adapter proof IDs and meter IDs share a bounded identifier format', async () => {
  const unsafe = 'Bearer fixture-secret with whitespace';
  for (const value of ['', unsafe, 'line\nbreak', '<script>', 'a'.repeat(129), 123, null, undefined]) {
    assert.equal(sanitizeRequestId(value), null);
  }
  assert.equal(sanitizeRequestId('request_123.A-b'), 'request_123.A-b');
  const meter = createRequestMeter(1, (async () => new Response('{}', { headers: { 'x-request-id': unsafe } })) as typeof fetch);
  await meter.request(modelUrl);
  assert.equal(meter.snapshot().traces[0].requestId, null);
  const evidence = serializeEvaluationEvidence({
    http: meter.snapshot(),
    results: [{ nvidiaWithoutRetrieval: { proof: { requestId: unsafe } }, tavily: { proof: { requestId: '<untrusted>' } }, nvidiaWithTavily: { proof: { requestId: 'safe-request.1' } } }],
  });
  assert.ok(!evidence.includes(unsafe));
  assert.ok(!evidence.includes('<untrusted>'));
  assert.equal(JSON.parse(evidence).results[0].nvidiaWithTavily.proof.requestId, 'safe-request.1');
});

test('upstream failures consume an attempt and are not retried', async () => {
  let calls = 0;
  const meter = createRequestMeter(2, (async () => { calls++; return new Response('{}', { status: 429 }); }) as typeof fetch);
  assert.equal((await meter.request(searchUrl, { method: 'POST' })).status, 429);
  assert.equal(calls, 1); assert.equal(meter.snapshot().traces[0].status, 429);
});

test('endpoint and method allowlist rejects redirects/query strings/other destinations before transport', async () => {
  let calls = 0;
  const meter = createRequestMeter(5, (async () => { calls++; return new Response('{}'); }) as typeof fetch);
  for (const [url, method] of [[modelUrl + '?secret=x', 'GET'], ['https://other.example/search', 'POST'], [searchUrl, 'GET'], ['https://api.tavily.com.evil.example/search', 'POST']]) {
    await assert.rejects(meter.request(url, { method }), /fixed provider endpoints/);
  }
  assert.equal(calls, 0); assert.equal(meter.snapshot().attemptedHttpRequests, 0);
});

test('snapshot is detached from the internal ledger and invalid caps fail closed', async () => {
  for (const cap of [0, 61, 1.5, NaN]) assert.throws(() => createRequestMeter(cap));
  const meter = createRequestMeter(1, (async () => new Response('{}')) as typeof fetch);
  await meter.request(new Request(modelUrl));
  const snapshot = meter.snapshot(); snapshot.traces[0].status = 999;
  assert.equal(meter.snapshot().traces[0].status, 200);
});

test('adapter with one remaining HTTP request cannot silently make a second completion call', async () => {
  let calls = 0;
  const config = { enabled: true, key: 'fixture-only-key', model: 'nvidia/fixture-only-model' };
  const meter = createRequestMeter(1, (async () => { calls++; return new Response(JSON.stringify({ data: [{ id: config.model }] })); }) as typeof fetch);
  const result = await explain(analyze(createDemoCsv()), true, config, meter.request);
  assert.equal(calls, 1); assert.equal(result.mode, 'fixture'); assert.equal(result.proof, undefined);
  assert.equal(meter.snapshot().blockedAttempts, 1);
  assert.equal(meter.snapshot().attemptedHttpRequests, 1);
});
