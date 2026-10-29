import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { canonicalHash, RequestLedger } from './ledger.mjs';
import { EvaluationTransportError, performRequest } from './transport.mjs';

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'marginguard-transport-'));
  const ledger = new RequestLedger({ directory, maxHttpRequests: 4, providerLimits: { model: 3, search: 1 }, maxReservedMicros: 1000, ...overrides });
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ledger, directory, log: () => readFileSync(join(directory, 'requests.jsonl'), 'utf8') };
}

function options(ledger, overrides = {}) {
  return { ledger, requestId: 'case-01-B-r1', caseId: 'case-01', arm: 'B', stage: 'completion', provider: 'model', body: { model: 'test-model', messages: [{ role: 'user', content: 'Synthetic aggregate' }] }, reserveMicros: 100, apiKey: 'sk-private-never-log', validate: raw => raw.value, ...overrides };
}

const valid = { id: 'provider-01', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, value: { status: 'hold' } };
const jsonResponse = (raw, init) => new globalThis.Response(JSON.stringify(raw), init);

test('fsynced reservation precedes one fixed POST; ledger stores hashes and usage only', async t => {
  const { ledger, log } = fixture(t);
  let calls = 0;
  const result = await performRequest(options(ledger, { transport: async (endpoint, init) => {
    calls++;
    const events = log().trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.at(-1).type, 'reserved');
    assert.equal(events.at(-1).request.requestHash, canonicalHash({ endpoint, body: JSON.parse(init.body) }));
    assert.equal(endpoint, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer sk-private-never-log');
    assert.equal(init.signal.aborted, false);
    return jsonResponse(valid, { headers: { 'x-request-id': 'header-request-01' } });
  } }));
  assert.equal(calls, 1); assert.deepEqual(result.value, { status: 'hold' });
  assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  assert.match(result.responseHash, /^[a-f0-9]{64}$/);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.outcomes.completed, 1); assert.equal(snapshot.totalCostMicros, null);
  assert.equal(snapshot.unknownCostRequests, 1); assert.equal(snapshot.reservedMicros, 100);
  assert.doesNotMatch(log(), /sk-private|Synthetic aggregate|test-model|Authorization|messages/);
  assert.equal(JSON.parse(log().trim().split('\n').at(-1)).result.providerRequestId, 'header-request-01');
  assert.equal(JSON.parse(log().trim().split('\n').at(-1)).result.validatedOutputHash, canonicalHash(result.value));
});

test('search uses fixed endpoint and records credits independently of price', async t => {
  const { ledger } = fixture(t);
  const result = await performRequest(options(ledger, { requestId: 'case-01-C-search', arm: 'C', stage: 'search', provider: 'search', transport: async endpoint => {
    assert.equal(endpoint, 'https://api.tavily.com/search');
    return jsonResponse({ usage: { credits: 1.5 }, value: [] });
  } }));
  assert.deepEqual(result.usage, { credits: 1.5 });
  assert.equal(ledger.snapshot().totalCostMicros, null);
});

test('missing or inconsistent usage remains unknown', async t => {
  const { ledger } = fixture(t);
  const missing = await performRequest(options(ledger, { transport: async () => jsonResponse({ value: 1 }) }));
  assert.equal(missing.usage, null);
  const inconsistent = await performRequest(options(ledger, { requestId: 'case-01-C-r1', arm: 'C', transport: async () => jsonResponse({ ...valid, usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 14 } }) }));
  assert.equal(inconsistent.usage, null);
  assert.equal(ledger.snapshot().totalCostMicros, null);
});

test('fetch exception produces unknown once without storing arbitrary error or credential', async t => {
  const { ledger, log } = fixture(t); let calls = 0;
  await assert.rejects(performRequest(options(ledger, { transport: async () => { calls++; throw new Error('sk-private-never-log order alice@example.com'); } })), error => {
    assert.ok(error instanceof EvaluationTransportError); assert.equal(error.outcome, 'unknown');
    assert.doesNotMatch(error.message, /private|alice/); return true;
  });
  assert.equal(calls, 1); assert.equal(ledger.snapshot().outcomes.unknown, 1);
  assert.doesNotMatch(log(), /private|alice/);
  await assert.rejects(performRequest(options(ledger, { transport: async () => { calls++; return jsonResponse(valid); } })), /already reserved/);
  assert.equal(calls, 1);
});

test('HTTP failure records response hash and known usage but never retries', async t => {
  const { ledger, log } = fixture(t); let calls = 0;
  await assert.rejects(performRequest(options(ledger, { transport: async () => { calls++; return jsonResponse(valid, { status: 429 }); } })), { code: 'http-error-response', outcome: 'failed' });
  assert.equal(calls, 1); assert.equal(ledger.snapshot().outcomes.failed, 1);
  const result = JSON.parse(log().trim().split('\n').at(-1)).result;
  assert.equal(result.httpStatus, 429); assert.equal(result.usage.inputTokens, 10);
  assert.equal(result.actualCostMicros, null); assert.match(result.responseHash, /^[a-f0-9]{64}$/);
  assert.equal(result.validatedOutputHash, null);
});

test('received invalid JSON is failed with its hash', async t => {
  const { ledger, log } = fixture(t);
  await assert.rejects(performRequest(options(ledger, { transport: async () => new globalThis.Response('{broken provider payload') })), { code: 'invalid-json-response', outcome: 'failed' });
  assert.equal(ledger.snapshot().outcomes.failed, 1);
  assert.match(JSON.parse(log().trim().split('\n').at(-1)).result.responseHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(log(), /broken provider payload/);
});

test('invalid UTF-8 fails without replacement decoding', async t => {
  const { ledger } = fixture(t);
  await assert.rejects(performRequest(options(ledger, { transport: async () => new globalThis.Response(new Uint8Array([0x22, 0xff, 0x22])) })), { code: 'invalid-json-response', outcome: 'failed' });
  assert.equal(ledger.snapshot().outcomes.failed, 1);
});

test('validator refusal or truncated output is failed, preserving usage', async t => {
  const { ledger, log } = fixture(t);
  await assert.rejects(performRequest(options(ledger, { transport: async () => jsonResponse(valid), validate: () => { throw new Error('raw secret or unsupported claim'); } })), { code: 'invalid-output-schema', outcome: 'failed' });
  assert.equal(ledger.snapshot().outcomes.failed, 1);
  assert.equal(JSON.parse(log().trim().split('\n').at(-1)).result.usage.outputTokens, 5);
  assert.doesNotMatch(log(), /raw secret|unsupported claim/);
});

test('response byte budget cancels overflowing stream and fails closed', async t => {
  const { ledger } = fixture(t); let canceled = false;
  const body = new globalThis.ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(200001)); }, cancel() { canceled = true; } });
  await assert.rejects(performRequest(options(ledger, { transport: async () => new globalThis.Response(body) })), { code: 'response-too-large', outcome: 'failed' });
  assert.equal(canceled, true); assert.equal(ledger.snapshot().outcomes.failed, 1);
});

test('oversized content length is rejected before reading the body', async t => {
  const { ledger } = fixture(t); let canceled = false;
  const body = new globalThis.ReadableStream({ cancel() { canceled = true; } });
  await assert.rejects(performRequest(options(ledger, { transport: async () => new globalThis.Response(body, { headers: { 'content-length': '200001' } }) })), { code: 'response-too-large', outcome: 'failed' });
  assert.equal(canceled, true);
});

test('body stream failure is unknown with received HTTP status', async t => {
  const { ledger, log } = fixture(t);
  const body = new globalThis.ReadableStream({ start(controller) { controller.error(new Error('private-stream-error')); } });
  await assert.rejects(performRequest(options(ledger, { transport: async () => new globalThis.Response(body) })), { code: 'response-body-unknown', outcome: 'unknown' });
  const result = JSON.parse(log().trim().split('\n').at(-1)).result;
  assert.equal(result.httpStatus, 200); assert.equal(result.responseHash, null);
  assert.doesNotMatch(log(), /private-stream-error/);
});

test('unsafe provider request IDs are discarded', async t => {
  const { ledger, log } = fixture(t);
  await performRequest(options(ledger, { transport: async () => jsonResponse({ ...valid, id: 'tvly-private-token' }, { headers: { 'x-request-id': 'sk-private-header' } }) }));
  assert.equal(JSON.parse(log().trim().split('\n').at(-1)).result.providerRequestId, null);
  assert.doesNotMatch(log(), /private/);
});

test('provider request IDs with punctuation first do not block terminal ledger writes', async t => {
  const { ledger, log } = fixture(t);
  await performRequest(options(ledger, { transport: async () => jsonResponse({ ...valid, id: '_unsupported-leading-character' }, { headers: { 'x-request-id': '.unsupported-leading-character' } }) }));
  assert.equal(ledger.snapshot().outcomes.completed, 1);
  assert.equal(JSON.parse(log().trim().split('\n').at(-1)).result.providerRequestId, null);
});

test('configured credentials echoed in safe-form provider IDs are discarded', async t => {
  const { ledger, log } = fixture(t), apiKey = 'plainConfiguredSecret42';
  await performRequest(options(ledger, { apiKey, transport: async () => jsonResponse({ ...valid, id: `request-${apiKey}` }, { headers: { 'x-request-id': `prefix-${apiKey}-suffix` } }) }));
  assert.equal(ledger.snapshot().outcomes.completed, 1);
  assert.equal(JSON.parse(log().trim().split('\n').at(-1)).result.providerRequestId, null);
  assert.equal(log().includes(apiKey), false);
});

test('validated output echoing configured credentials fails without exporting that output', async t => {
  const { ledger, log } = fixture(t), apiKey = 'plainConfiguredSecret42'; let calls = 0;
  await assert.rejects(performRequest(options(ledger, { apiKey, transport: async () => {
    calls++; return jsonResponse({ ...valid, value: { status: 'hold', rationale: `echo ${apiKey}` } });
  } })), error => {
    assert.equal(error.code, 'invalid-output-schema'); assert.equal(error.outcome, 'failed');
    assert.equal(error.message.includes(apiKey), false); return true;
  });
  assert.equal(calls, 1); assert.equal(ledger.snapshot().outcomes.failed, 1);
  const result = JSON.parse(log().trim().split('\n').at(-1)).result;
  assert.equal(result.validatedOutputHash, null); assert.equal(result.usage.inputTokens, 10);
  assert.match(result.responseHash, /^[a-f0-9]{64}$/); assert.equal(log().includes(apiKey), false);
});

test('credential checks inspect actual nested strings and keys rather than JSON escape bytes', async t => {
  const { ledger, log } = fixture(t), apiKey = 'configured"secret\\key';
  await assert.rejects(performRequest(options(ledger, { apiKey, transport: async () => jsonResponse({ ...valid, value: { nested: [apiKey] } }) })), { code: 'invalid-output-schema', outcome: 'failed' });
  await assert.rejects(performRequest(options(ledger, { apiKey, requestId: 'case-01-C-r1', arm: 'C', transport: async () => jsonResponse({ ...valid, value: { [apiKey]: 'echo as object key' } }) })), { code: 'invalid-output-schema', outcome: 'failed' });
  assert.equal(ledger.snapshot().outcomes.failed, 2); assert.equal(log().includes(apiKey), false);
});

test('invalid configuration, invalid payload, and already aborted signal never dispatch', async t => {
  const { ledger } = fixture(t); let calls = 0;
  const transport = async () => { calls++; return jsonResponse(valid); };
  await assert.rejects(performRequest(options(ledger, { transport, provider: 'other' })), { outcome: 'not-dispatched' });
  await assert.rejects(performRequest(options(ledger, { transport, body: { bad: undefined } })), { code: 'invalid-request-body' });
  await assert.rejects(performRequest(options(ledger, { transport, apiKey: 'secret\ninjection' })), { code: 'invalid-configuration' });
  await assert.rejects(performRequest(options(ledger, { transport, signal: globalThis.AbortSignal.abort() })), { code: 'aborted-before-dispatch' });
  assert.equal(calls, 0); assert.equal(ledger.snapshot().reservedHttpRequests, 0);
});

test('budget exhaustion prevents a subsequent transport invocation', async t => {
  const { ledger } = fixture(t, { maxHttpRequests: 1 }); let calls = 0;
  const transport = async () => { calls++; return jsonResponse(valid); };
  await performRequest(options(ledger, { transport }));
  await assert.rejects(performRequest(options(ledger, { requestId: 'case-01-C-r1', arm: 'C', transport })), /cap exhausted/);
  assert.equal(calls, 1);
});

test('completion durability failure leaves reservation unretryable and emits no replacement request', async t => {
  const { ledger } = fixture(t); let calls = 0;
  const transport = async () => { calls++; return jsonResponse(valid); };
  const originalComplete = ledger.complete;
  ledger.complete = () => { throw new Error('Simulated durable completion failure'); };
  await assert.rejects(performRequest(options(ledger, { transport })), /durable completion failure/);
  assert.equal(ledger.snapshot().outcomes.reserved, 1);
  ledger.complete = originalComplete;
  await assert.rejects(performRequest(options(ledger, { transport })), /already reserved/);
  assert.equal(calls, 1);
});
