import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { RequestLedger, canonicalHash } from './ledger.mjs';
import { makePlan } from './core.mjs';
import { bindRun, collectSources, runInference, verifyFrozenLineage, verifiedReviewRows, writeArtifact } from './run.mjs';
import { createBlindPacket, scoreBlindReviews } from './blind.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const clone = value => globalThis.structuredClone(value);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const datasetFor = () => ({ schemaVersion: 1, datasetId: 'TEST-ONLY-run-scaffold', partition: 'development', synthetic: true, cases: [
  { id: 'TEST-ONLY-H01', stratum: 'applicable-discount', kind: 'discount', context: { platform: 'Shopify', carrier: 'UPS', region: 'US', discountOrigin: 'native' }, issue: { affectedOrders: 8, modeledExposureCents: 12000, thresholdBasisPoints: 2000 } },
] });
const configFor = dataset => ({ schemaVersion: 1, releaseCommit: 'a'.repeat(40), datasetHash: canonicalHash(dataset), model: 'nvidia/Nemotron-3_5-Lightning', temperature: 0, maxTokens: 800, replicates: 2,
  budget: { maxHttpRequests: 5 * dataset.cases.length, maxModelRequests: 4 * dataset.cases.length, maxSearchRequests: dataset.cases.length, maxReservedMicros: 500 * dataset.cases.length, modelRequestReserveMicros: 100, searchRequestReserveMicros: 100 },
  readiness: { projectComplete: false, holdoutSealedByIndependentAuthor: false, goldSeparated: false, pricingUpperBoundsReviewed: false, providerBillingBoundaryReviewed: false } });
const output = () => ({ status: 'insufficient', rationale: 'TEST ONLY conservative review.', nextCheck: 'Inspect the operative policy and one flagged transaction.', disconfirmingEvidence: 'The transaction and effective policy may disprove the hypothesis.', sourceIds: [] });
const searchRaw = () => ({ results: [{ url: 'https://help.shopify.com/en/manual/discounts', title: 'TEST ONLY official-source envelope', content: 'TEST ONLY clause about inspecting applicable combination settings.' }], usage: { credits: 1 } });
const modelRaw = () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output()) } }], usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 } });
const response = (raw, init) => new globalThis.Response(JSON.stringify(raw), init);

function fixture(t, { caseCount = 1 } = {}) {
  // Workspace temp files avoid Windows sandbox temp redirection denying atomic rename.
  const privateRoot = join(ROOT, 'benchmark-private'); mkdirSync(privateRoot, { recursive: true });
  const directory = mkdtempSync(join(privateRoot, 'TEST-ONLY-run-'));
  const dataset = datasetFor();
  dataset.cases = Array.from({ length: caseCount }, (_, index) => ({ ...clone(dataset.cases[0]), id: `TEST-ONLY-H${index + 1}`, issue: { ...dataset.cases[0].issue, affectedOrders: 8 + index } }));
  const config = configFor(dataset), b = config.budget;
  const open = () => new RequestLedger({ directory, maxHttpRequests: b.maxHttpRequests, providerLimits: { model: b.maxModelRequests, search: b.maxSearchRequests }, maxReservedMicros: b.maxReservedMicros });
  const ledger = open();
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, dataset, config, ledger, open, apiKey: 'OFFLINE-FAKE-KEY', transport: async endpoint => response(endpoint.includes('tavily') ? searchRaw() : modelRaw()) };
}

async function collect(f) {
  const plan = makePlan(f.config, f.dataset);
  return collectSources({ ...f, plan });
}

test('an approved experiment binds idempotently to one run directory and cannot acquire a fresh budget elsewhere', t => {
  const f = fixture(t), registryRoot = join(f.directory, 'TEST-ONLY-registry'), runnerHash = 'c'.repeat(64);
  bindRun(f.directory, f.config, f.dataset, runnerHash, registryRoot);
  const registryFiles = readdirSync(registryRoot);
  assert.equal(registryFiles.length, 1);
  const registryPath = join(registryRoot, registryFiles[0]), original = readFileSync(registryPath, 'utf8');
  assert.equal(readJson(registryPath).runDirectory, resolve(f.directory));
  assert.doesNotThrow(() => bindRun(f.directory, f.config, f.dataset, runnerHash, registryRoot));
  assert.equal(readFileSync(registryPath, 'utf8'), original);
  const alternateDirectory = join(f.directory, 'TEST-ONLY-alternate-run');
  assert.throws(() => bindRun(alternateDirectory, f.config, f.dataset, runnerHash, registryRoot), /already bound/);
  assert.equal(existsSync(join(alternateDirectory, 'run-binding.json')), false);
  assert.equal(readdirSync(registryRoot).length, 1); assert.equal(readFileSync(registryPath, 'utf8'), original);
});

test('a changed plan requiring a new approval has a distinct experiment binding', t => {
  const f = fixture(t), registryRoot = join(f.directory, 'TEST-ONLY-registry'), runnerHash = 'c'.repeat(64);
  bindRun(f.directory, f.config, f.dataset, runnerHash, registryRoot);
  const changedConfig = { ...clone(f.config), temperature: 0.1 }, alternateDirectory = join(f.directory, 'TEST-ONLY-new-approved-plan');
  assert.notEqual(makePlan(f.config, f.dataset).planHash, makePlan(changedConfig, f.dataset).planHash);
  assert.doesNotThrow(() => bindRun(alternateDirectory, changedConfig, f.dataset, runnerHash, registryRoot));
  assert.equal(readdirSync(registryRoot).length, 2);
  assert.equal(readJson(join(alternateDirectory, 'run-binding.json')).configHash, canonicalHash(changedConfig));
});

test('torn experiment registry records fail closed without granting a new run directory', t => {
  const f = fixture(t), registryRoot = join(f.directory, 'TEST-ONLY-registry'), runnerHash = 'c'.repeat(64);
  mkdirSync(registryRoot);
  const binding = { schemaVersion: 1, configHash: canonicalHash(f.config), datasetHash: canonicalHash(f.dataset), runnerHash };
  const registryPath = join(registryRoot, `${canonicalHash(binding)}.json`), torn = '{"schemaVersion":';
  writeFileSync(registryPath, torn);
  assert.throws(() => bindRun(f.directory, f.config, f.dataset, runnerHash, registryRoot));
  assert.equal(readFileSync(registryPath, 'utf8'), torn);
  assert.equal(existsSync(join(f.directory, 'run-binding.json')), false);
});

test('offline end-to-end retrieval and paired inference share one hard ledger and resume without HTTP', async t => {
  const f = fixture(t); let calls = 0; const bodies = [];
  f.transport = async (endpoint, init) => { calls++; bodies.push({ endpoint, body: JSON.parse(init.body) }); return response(endpoint.includes('tavily') ? searchRaw() : modelRaw()); };
  const frozen = await collect(f), plan = makePlan(f.config, f.dataset, frozen);
  verifyFrozenLineage(frozen, f.dataset, f.config, f.ledger, readJson(join(f.directory, 'frozen-sources.json')));
  const result = await runInference({ ...f, frozen, plan });
  assert.equal(calls, 5); assert.equal(f.ledger.snapshot().reservedHttpRequests, 5);
  assert.deepEqual(f.ledger.snapshot().providerRequests, { model: 4, search: 1 });
  assert.equal(f.ledger.snapshot().reservedMicros, 500); assert.equal(f.ledger.snapshot().totalCostMicros, null);
  assert.equal(result.status, 'awaiting-human-review'); assert.equal(result.independentCaseCount, 1);
  assert.equal(result.rows.length, 6); assert.equal(result.results.length, 4);
  assert.equal(result.rows.filter(row => row.arm === 'A').length, 2);
  const requests = bodies.filter(body => body.endpoint.includes('nebius'));
  assert.equal(requests.length, 4);
  const prompts = requests.map(request => JSON.parse(request.body.messages[1].content));
  assert.equal(prompts.filter(prompt => prompt.sources.length === 0).length, 2);
  assert.equal(prompts.filter(prompt => prompt.sources.length === 1).length, 2);
  const normalized = requests.map(request => { const body = clone(request.body), user = JSON.parse(body.messages[1].content); user.sources = []; body.messages[1].content = JSON.stringify(user); return body; });
  assert.ok(normalized.every(body => JSON.stringify(body) === JSON.stringify(normalized[0])));
  assert.equal(JSON.stringify(bodies).includes(f.dataset.cases[0].id), false);
  assert.equal(JSON.stringify(bodies).includes('applicable-discount'), false);
  await collect(f);
  await runInference({ ...f, frozen, plan });
  assert.equal(calls, 5); assert.equal(f.ledger.snapshot().reservedHttpRequests, 5);
});

test('HTTP search failure remains failed and is never silently retried on resume', async t => {
  const f = fixture(t); let calls = 0;
  f.transport = async () => { calls++; return response({ error: 'TEST ONLY quota failure' }, { status: 429 }); };
  const frozen = await collect(f);
  assert.equal(frozen.packets[0].outcome, 'failed'); assert.deepEqual(frozen.packets[0].sources, []);
  assert.equal(f.ledger.snapshot().outcomes.failed, 1);
  await collect(f);
  assert.equal(calls, 1); assert.equal(f.ledger.snapshot().totalCostMicros, null);
});

test('unknown retrieval outcome halts immediately and is not retried after restart', async t => {
  const f = fixture(t); let calls = 0;
  f.transport = async () => { calls++; throw new Error('TEST ONLY simulated ambiguous network result'); };
  await assert.rejects(collect(f), /Unknown provider outcome/);
  assert.equal(calls, 1); assert.equal(f.ledger.snapshot().outcomes.unknown, 1);
  assert.equal(readJson(join(f.directory, 'retrieval-checkpoint.json')).packets[0].outcome, 'unknown');
  assert.equal(existsSync(join(f.directory, 'frozen-sources.json')), false);
  f.ledger.close(); const reopened = f.open();
  try { await assert.rejects(collect({ ...f, ledger: reopened }), /Unknown provider outcome/); } finally { reopened.close(); }
  assert.equal(calls, 1);
});

test('unknown inference outcome halts without fallback output or replacement HTTP', async t => {
  const f = fixture(t), frozen = await collect(f), plan = makePlan(f.config, f.dataset, frozen); let calls = 0;
  f.transport = async () => { calls++; throw new Error('TEST ONLY ambiguous model transport'); };
  await assert.rejects(runInference({ ...f, frozen, plan }), /Unknown provider outcome/);
  const checkpoint = readJson(join(f.directory, 'inference-checkpoint.json'));
  assert.equal(checkpoint.results.length, 1); assert.equal(checkpoint.results[0].outcome, 'unknown'); assert.equal(checkpoint.results[0].output, null);
  const artifact = readJson(join(f.directory, 'results-private.json'));
  assert.equal(artifact.status, 'incomplete'); assert.equal(artifact.independentCaseCount, 1); assert.equal(artifact.replicates, 2);
  assert.equal(artifact.rows.length, 6); assert.equal(artifact.results.length, 1);
  assert.equal(artifact.rows.filter(row => row.arm === 'A' && row.output !== null).length, 2);
  assert.equal(artifact.rows.filter(row => ['B', 'C'].includes(row.arm) && row.output === null).length, 4);
  const { packet, mapping } = createBlindPacket(artifact.rows, { seed: 'TEST-ONLY-INTERRUPTED-SEED' });
  assert.equal(packet.items.length, 6); assert.equal(packet.items.filter(item => item.output === null).length, 4);
  const score = scoreBlindReviews(mapping, []);
  assert.equal(score.arms.B.denominator, 2); assert.equal(score.arms.C.denominator, 2);
  assert.equal(score.arms.B.missingOutput, 2); assert.equal(score.arms.C.missingOutput, 2);
  assert.deepEqual(verifiedReviewRows({ ...f, frozen, plan, artifact }), artifact.rows);
  await assert.rejects(runInference({ ...f, frozen, plan }), /Unknown provider outcome/);
  assert.equal(calls, 1);
});

test('per-request approval check stops retrieval before reserving or dispatching the next HTTP request', async t => {
  const f = fixture(t, { caseCount: 2 }); let calls = 0, checks = 0;
  f.transport = async () => { calls++; return response(searchRaw()); };
  f.beforeRequest = () => { checks++; if (checks === 2) throw new Error('TEST ONLY approval expired'); };
  await assert.rejects(collect(f), /approval expired/);
  assert.equal(calls, 1); assert.equal(checks, 2);
  assert.equal(f.ledger.snapshot().reservedHttpRequests, 1);
  assert.equal(readJson(join(f.directory, 'retrieval-checkpoint.json')).packets.length, 1);
  assert.equal(existsSync(join(f.directory, 'frozen-sources.json')), false);
});

test('per-request approval expiry stops the next model HTTP while preserving the full report denominator', async t => {
  const f = fixture(t), frozen = await collect(f), plan = makePlan(f.config, f.dataset, frozen); let calls = 0, checks = 0;
  f.transport = async () => { calls++; return response(modelRaw()); };
  const beforeRequest = () => { checks++; if (checks === 2) throw new Error('TEST ONLY approval expired'); };
  await assert.rejects(runInference({ ...f, frozen, plan, beforeRequest }), /approval expired/);
  assert.equal(calls, 1); assert.equal(checks, 2);
  assert.deepEqual(f.ledger.snapshot().providerRequests, { model: 1, search: 1 });
  const artifact = readJson(join(f.directory, 'results-private.json'));
  assert.equal(artifact.status, 'incomplete'); assert.equal(artifact.rows.length, 6);
  assert.equal(artifact.rows.filter(row => ['B', 'C'].includes(row.arm) && row.output === null).length, 3);
});

test('completion ledger failure stops inference and recovered reservation stays unknown', async t => {
  const f = fixture(t), frozen = await collect(f), plan = makePlan(f.config, f.dataset, frozen); let calls = 0;
  f.transport = async () => { calls++; return response(modelRaw()); };
  f.ledger.complete = () => { throw new Error('TEST ONLY completion fsync failure'); };
  await assert.rejects(runInference({ ...f, frozen, plan }), /Unknown provider outcome/);
  assert.equal(calls, 1); assert.equal(f.ledger.snapshot().outcomes.reserved, 1);
  assert.equal(readJson(join(f.directory, 'inference-checkpoint.json')).results[0].output, null);
  f.ledger.close(); const reopened = f.open();
  try {
    assert.equal(reopened.snapshot().outcomes.unknown, 1);
    await assert.rejects(runInference({ ...f, ledger: reopened, frozen, plan }), /Unknown provider outcome/);
  } finally { reopened.close(); }
  assert.equal(calls, 1);
});

test('frozen source lineage rejects forged plan, outcome, request and jointly altered passage checkpoints', async t => {
  const f = fixture(t), frozen = await collect(f);
  assert.doesNotThrow(() => verifyFrozenLineage(frozen, f.dataset, f.config, f.ledger, frozen));
  for (const mutate of [
    value => { value.retrievalPlanHash = 'b'.repeat(64); },
    value => { value.packets[0].outcome = 'failed'; value.packets[0].sources = []; },
    value => { value.packets[0].requestId = 'search-other'; },
    value => { value.packets[0].sources[0].text = 'TEST ONLY tampered policy clause'; },
  ]) {
    const forged = clone(frozen); mutate(forged);
    assert.throws(() => verifyFrozenLineage(forged, f.dataset, f.config, f.ledger, forged));
  }
});

test('completed source checkpoint cannot be changed and accepted on collection resume', async t => {
  const f = fixture(t); let calls = 0;
  f.transport = async () => { calls++; return response(searchRaw()); };
  await collect(f);
  const path = join(f.directory, 'retrieval-checkpoint.json'), checkpoint = readJson(path);
  checkpoint.packets[0].sources[0].text = 'TEST ONLY altered content'; writeArtifact(path, checkpoint);
  await assert.rejects(collect(f));
  assert.equal(calls, 1);
});

test('completed output checkpoint cannot be changed and accepted on inference resume', async t => {
  const f = fixture(t), frozen = await collect(f), plan = makePlan(f.config, f.dataset, frozen); let calls = 0;
  f.transport = async () => { calls++; return response(modelRaw()); };
  await runInference({ ...f, frozen, plan });
  const path = join(f.directory, 'inference-checkpoint.json'), checkpoint = readJson(path);
  checkpoint.results[0].output.rationale = 'TEST ONLY tampered rationale'; writeArtifact(path, checkpoint);
  await assert.rejects(runInference({ ...f, frozen, plan }));
  assert.equal(calls, 4);
});

test('offline blind-review rows are reconstructed from the plan and durable validated outputs', async t => {
  const f = fixture(t), frozen = await collect(f), plan = makePlan(f.config, f.dataset, frozen);
  const artifact = await runInference({ ...f, frozen, plan });
  assert.deepEqual(verifiedReviewRows({ ...f, frozen, plan, artifact }), artifact.rows);
  const verify = value => verifiedReviewRows({ ...f, frozen, plan, artifact: value });
  const mutations = [
    value => { value.rows[0].output.rationale = 'TEST ONLY forged deterministic answer'; },
    value => { value.rows.find(row => row.arm === 'B').output.rationale = 'TEST ONLY forged row answer'; },
    value => {
      value.results[0].output.rationale = 'TEST ONLY jointly forged result and row';
      const request = plan.requests.find(request => request.requestId === value.results[0].requestId);
      value.rows.find(row => row.arm === request.arm && row.caseId === `${request.caseId}__R${request.replicate}`).output = clone(value.results[0].output);
    },
    value => { value.results[0].outcome = 'unknown'; value.results[0].output = null; },
    value => { value.results.push(clone(value.results[0])); },
    value => { value.results[0].requestId = 'model-TEST-ONLY-forged-B-1'; },
    value => { value.planHash = 'b'.repeat(64); },
    value => { value.datasetHash = 'b'.repeat(64); },
    value => { value.sourcesHash = 'b'.repeat(64); },
    value => { value.rows.pop(); },
  ];
  for (const mutate of mutations) {
    const forged = clone(artifact); mutate(forged);
    assert.throws(() => verify(forged));
  }
});

test('missing durable checkpoint prevents repeating a completed billed request', async t => {
  const f = fixture(t); let calls = 0;
  f.transport = async () => { calls++; return response(searchRaw()); };
  const frozen = await collect(f);
  writeArtifact(join(f.directory, 'retrieval-checkpoint.json'), { planHash: frozen.retrievalPlanHash, packets: [] });
  await assert.rejects(collect(f), /checkpoint/);
  assert.equal(calls, 1);
});

test('standalone CLI plan is offline and final collection rejects missing execution gate before any network', t => {
  const f = fixture(t), configPath = join(f.directory, 'config.json'), datasetPath = join(f.directory, 'dataset.json');
  writeFileSync(configPath, JSON.stringify(f.config)); writeFileSync(datasetPath, JSON.stringify(f.dataset));
  const preloader = join(f.directory, 'no-network.mjs');
  writeFileSync(preloader, "import process from 'node:process'; globalThis.fetch = () => { process.stderr.write('FORBIDDEN_NETWORK'); throw new Error('No network in test'); };\n");
  const env = { ...process.env }; delete env.MARGINGUARD_FINAL_BENCHMARK; delete env.TAVILY_API_KEY; delete env.NEBIUS_API_KEY;
  const runDir = `benchmark-private/TEST-ONLY-${basename(f.directory)}`;
  const common = ['--import', pathToFileURL(preloader).href, join(ROOT, 'scripts/benchmark/run.mjs')];
  const args = ['--config', configPath, '--dataset', datasetPath, '--run-dir', runDir];
  const planned = spawnSync(process.execPath, [...common, 'plan', ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 10000 });
  assert.equal(planned.status, 0, planned.stderr); assert.equal(JSON.parse(planned.stdout).readiness, 'closed');
  assert.doesNotMatch(planned.stderr, /FORBIDDEN_NETWORK/);
  const blocked = spawnSync(process.execPath, [...common, 'collect', ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 10000 });
  assert.equal(blocked.status, 1); assert.match(blocked.stderr, /Benchmark stopped/);
  assert.doesNotMatch(blocked.stderr, /FORBIDDEN_NETWORK/); assert.equal(existsSync(join(ROOT, runDir)), false);
});
