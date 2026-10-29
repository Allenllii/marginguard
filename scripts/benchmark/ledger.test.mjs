import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { canonicalHash, RequestLedger } from './ledger.mjs';

function setup(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'marginguard-ledger-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const options = { directory, maxHttpRequests: 3, providerLimits: { model: 2, search: 1 }, maxReservedMicros: 300, ...overrides };
  const ledger = new RequestLedger(options);
  t.after(() => ledger.close());
  return { ledger, directory, options };
}

function request(requestId = 'r1', overrides = {}) {
  return { requestId, caseId: 'H01', arm: 'B', stage: 'decision', provider: 'model', requestHash: canonicalHash({ public: 'redacted test input' }), reserveMicros: 100, ...overrides };
}

test('canonical SHA-256 is insensitive to object key order and rejects unsupported values', () => {
  assert.equal(canonicalHash({ b: [1, { d: 2, c: 3 }], a: true }), canonicalHash({ a: true, b: [1, { c: 3, d: 2 }] }));
  assert.notEqual(canonicalHash({ a: ['x', 'y'] }), canonicalHash({ a: ['y', 'x'] }));
  assert.throws(() => canonicalHash({ missing: undefined }));
  assert.throws(() => canonicalHash(Infinity));
});

test('reservation is on disk before caller may dispatch and records are hash chained', t => {
  const { ledger } = setup(t);
  assert.equal(ledger.reserve(request()), 'r1');
  const entries = readFileSync(ledger.path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  assert.equal(entries.length, 2);
  assert.equal(entries[1].type, 'reserved');
  assert.equal(entries[1].previousHash, entries[0].hash);
  const { hash, ...unsigned } = entries[1];
  assert.equal(hash, canonicalHash(unsigned));
  assert.equal(ledger.snapshot().outcomes.reserved, 1);
});

test('all outcomes permanently consume HTTP and cost budgets; unknown cost remains null', t => {
  const { ledger } = setup(t);
  ledger.reserve(request());
  ledger.complete('r1', { responseHash: canonicalHash({ ok: true }), httpStatus: 200, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, actualCostMicros: 7 });
  ledger.reserve(request('r2'));
  ledger.fail('r2', { httpStatus: 429 });
  ledger.reserve(request('r3', { provider: 'search', arm: 'C', stage: 'retrieval' }));
  ledger.unknown('r3');
  assert.throws(() => ledger.reserve(request('r4', { provider: 'search' })), /cap exhausted/);
  const snapshot = ledger.snapshot();
  assert.equal(snapshot.reservedHttpRequests, 3);
  assert.equal(snapshot.reservedMicros, 300);
  assert.equal(snapshot.knownCostMicros, 7);
  assert.equal(snapshot.totalCostMicros, null);
  assert.equal(snapshot.unknownCostRequests, 2);
  assert.deepEqual(snapshot.outcomes, { reserved: 0, completed: 1, failed: 1, unknown: 1 });
});

test('provider and cost caps reject reservations without writing another record', t => {
  const { ledger } = setup(t, { maxHttpRequests: 10, providerLimits: { model: 1, search: 1 }, maxReservedMicros: 150 });
  ledger.reserve(request());
  const before = readFileSync(ledger.path, 'utf8');
  assert.throws(() => ledger.reserve(request('r2', { reserveMicros: 1 })), /cap exhausted/);
  assert.throws(() => ledger.reserve(request('r2', { provider: 'search', reserveMicros: 51 })), /cap exhausted/);
  assert.equal(readFileSync(ledger.path, 'utf8'), before);
});

test('known charges above reservation fail closed for later requests', t => {
  const { ledger } = setup(t);
  ledger.reserve(request());
  ledger.complete('r1', { actualCostMicros: 301 });
  assert.equal(ledger.snapshot().accountedMicros, 301);
  assert.throws(() => ledger.reserve(request('r2', { reserveMicros: 1 })), /cap exhausted/);
});

test('missing or malformed budgets never authorize a request', t => {
  const directory = mkdtempSync(join(tmpdir(), 'marginguard-bad-budget-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const good = { directory, maxHttpRequests: 1, providerLimits: { model: 1, search: 0 }, maxReservedMicros: 100 };
  for (const invalid of [{ maxHttpRequests: 121 }, { maxHttpRequests: NaN }, { maxHttpRequests: 0 }, { providerLimits: { model: 97, search: 0 } }, { providerLimits: { model: 0, search: 25 } }, { maxReservedMicros: 0 }, { maxReservedMicros: 1.5 }]) assert.throws(() => new RequestLedger({ ...good, ...invalid }));
});

test('metadata allowlist rejects raw bodies, errors, credentials, token-like ids and unsafe usage', t => {
  const { ledger } = setup(t);
  assert.throws(() => ledger.reserve(request('r1', { body: 'private input' })), /Unapproved metadata/);
  assert.throws(() => ledger.reserve(request('sk-secret')), /identifier/);
  assert.throws(() => ledger.reserve(request('r1', { reserveMicros: 0 })));
  ledger.reserve(request());
  assert.throws(() => ledger.complete('r1', { rawResponse: 'private output' }), /Unapproved metadata/);
  assert.throws(() => ledger.fail('r1', { error: 'API key: example' }), /Unapproved metadata/);
  assert.throws(() => ledger.complete('r1', { providerRequestId: 'Bearer-private' }), /identifier/);
  assert.throws(() => ledger.complete('r1', { usage: { inputTokens: -1 } }));
  assert.throws(() => ledger.complete('r1', { usage: { inputTokens: 2, outputTokens: 1, totalTokens: 2 } }));
  ledger.unknown('r1');
  const bytes = readFileSync(ledger.path, 'utf8');
  for (const secret of ['private input', 'private output', 'API key', 'Bearer-private', 'sk-secret']) assert.equal(bytes.includes(secret), false);
});

test('duplicate reservations and duplicate terminal transitions cannot trigger automatic retries', t => {
  const { ledger } = setup(t);
  ledger.reserve(request());
  assert.throws(() => ledger.reserve(request()), /retry is prohibited/);
  ledger.unknown('r1');
  assert.throws(() => ledger.complete('r1'), /already terminal/);
  assert.throws(() => ledger.reserve(request()), /retry is prohibited/);
});

test('lookup and snapshots are detached and search credits do not imply known price', t => {
  const { ledger } = setup(t);
  ledger.reserve(request('search1', { provider: 'search', arm: 'C', stage: 'retrieval' }));
  ledger.complete('search1', { usage: { credits: 0.5 } });
  assert.equal(ledger.lookup('absent'), null);
  const copy = ledger.lookup('search1');
  assert.equal(copy.result.usage.credits, 0.5);
  assert.equal(copy.result.usage.totalTokens, null);
  copy.result.usage.credits = 99;
  const snapshot = ledger.snapshot();
  snapshot.reservations[0].state = 'reserved';
  snapshot.providerLimits.search = 99;
  assert.equal(ledger.lookup('search1').state, 'completed');
  assert.equal(ledger.lookup('search1').result.usage.credits, 0.5);
  assert.equal(ledger.snapshot().providerLimits.search, 1);
  assert.equal(ledger.snapshot().totalCostMicros, null);
  assert.equal(snapshot.eventsHash, snapshot.lastHash);
});

test('validated output fingerprints persist across restart and reject malformed metadata', t => {
  const { ledger, options } = setup(t);
  const validatedOutputHash = canonicalHash({ status: 'hold', sourceIds: [] });
  ledger.reserve(request());
  assert.throws(() => ledger.complete('r1', { validatedOutputHash: 'not-a-digest' }), /SHA-256/);
  assert.equal(ledger.lookup('r1').state, 'reserved');
  ledger.complete('r1', { validatedOutputHash });
  assert.equal(ledger.lookup('r1').result.validatedOutputHash, validatedOutputHash);
  ledger.reserve(request('r2'));
  ledger.unknown('r2');
  assert.equal(ledger.lookup('r2').result.validatedOutputHash, null);
  ledger.close();
  const reopened = new RequestLedger(options);
  t.after(() => reopened.close());
  assert.equal(reopened.lookup('r1').result.validatedOutputHash, validatedOutputHash);
  assert.equal(reopened.lookup('r2').result.validatedOutputHash, null);
});

test('restart preserves caps and converts outstanding reservations to unknown', t => {
  const { ledger, options } = setup(t);
  ledger.reserve(request());
  ledger.close();
  const reopened = new RequestLedger(options);
  t.after(() => reopened.close());
  assert.equal(reopened.snapshot().outcomes.unknown, 1);
  assert.equal(reopened.snapshot().totalCostMicros, null);
  assert.throws(() => reopened.reserve(request()), /retry is prohibited/);
  reopened.close();
  assert.throws(() => new RequestLedger({ ...options, maxHttpRequests: 4 }), /caps changed/);
  const original = new RequestLedger(options);
  original.close();
});

test('one process cannot acquire or reclaim another live owner lock', t => {
  const { options } = setup(t);
  assert.throws(() => new RequestLedger(options), /locked/);
  assert.throws(() => new RequestLedger({ ...options, reclaimLock: true }), /locked/);
});

test('crash leaves reservation durable; explicit dead-lock reclaim records unknown without retry', t => {
  const { ledger, options } = setup(t);
  ledger.close();
  const script = `import { RequestLedger } from ${JSON.stringify(new URL('./ledger.mjs', import.meta.url).href)}; const ledger = new RequestLedger(${JSON.stringify(options)}); ledger.reserve(${JSON.stringify(request())}); process.exit(0);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.throws(() => new RequestLedger(options), /locked/);
  const recovered = new RequestLedger({ ...options, reclaimLock: true });
  t.after(() => recovered.close());
  assert.equal(recovered.snapshot().reservedHttpRequests, 1);
  assert.equal(recovered.snapshot().outcomes.unknown, 1);
  assert.throws(() => recovered.reserve(request()), /retry is prohibited/);
});

test('tampered chain or torn writes fail closed instead of resetting budgets', t => {
  const { ledger, options } = setup(t);
  ledger.reserve(request());
  ledger.close();
  const original = readFileSync(ledger.path, 'utf8');
  writeFileSync(ledger.path, original.replace('"reserveMicros":100', '"reserveMicros":1'));
  assert.throws(() => new RequestLedger(options), /Broken ledger/);
  writeFileSync(ledger.path, original + '{"partial":');
  assert.throws(() => new RequestLedger(options), /Incomplete ledger/);
  writeFileSync(ledger.path, original);
  const repaired = new RequestLedger(options);
  repaired.close();
});
