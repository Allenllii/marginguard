// Explicitly invoked evaluation CLI; never imported by the app or npm check.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { RequestLedger, canonicalHash } from './ledger.mjs';
import { makePlan, validateConfig, validateDataset, validateFrozen, validateOutput, buildModelBody, searchBody, extractSearchSources, extractCompletion, deterministicBaseline, assertExecutionReady, exact } from './core.mjs';
import { performRequest } from './transport.mjs';
import { createBlindPacket, scoreBlindReviews } from './blind.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULES = resolve(ROOT, 'scripts/benchmark');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
export function runnerFingerprint() {
  return canonicalHash({ runtime: { node: process.version, platform: process.platform, arch: process.arch }, modules: readdirSync(MODULES).filter(f => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).sort().map(file => ({ file, content: readFileSync(join(MODULES, file), 'utf8') })) });
}
export function writeArtifact(path, value, { once = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  if (once && existsSync(path)) {
    if (canonicalHash(readJson(path)) !== canonicalHash(value)) throw new Error('Frozen artifact already exists with different contents');
    return;
  }
  const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
  const fd = openSync(temporary, 'wx', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, path);
  // Directory fsync is supported on POSIX, but not on all Windows filesystems.
  let directory;
  try { directory = openSync(dirname(path), 'r'); fsyncSync(directory); } catch { /* File is fsynced; Windows rename durability still depends on the filesystem. */ }
  finally { if (directory !== undefined) closeSync(directory); }
}
function requestHash(provider, body) {
  const endpoint = provider === 'search' ? 'https://api.tavily.com/search' : 'https://api.tokenfactory.nebius.com/v1/chat/completions';
  return canonicalHash({ endpoint, body });
}
export function verifyFrozenLineage(frozen, dataset, config, ledger, savedFrozen) {
  validateFrozen(frozen, dataset);
  const retrievalPlan = makePlan(config, dataset);
  if (!savedFrozen || canonicalHash(frozen) !== canonicalHash(savedFrozen) || frozen.retrievalPlanHash !== retrievalPlan.planHash) throw new Error('Frozen sources must match the sealed retrieval checkpoint and original plan');
  for (const c of dataset.cases) {
    const packet = frozen.packets.find(p => p.caseId === c.id);
    const record = ledger.lookup(packet.requestId);
    if (!record || record.state !== packet.outcome || record.provider !== 'search' || record.caseId !== c.id || record.arm !== 'C' || record.stage !== 'retrieval' || record.requestHash !== requestHash('search', searchBody(c)) || record.reserveMicros !== config.budget.searchRequestReserveMicros || (record.state === 'completed' && record.result.validatedOutputHash !== canonicalHash(packet.sources))) throw new Error('Frozen retrieval ledger lineage mismatch');
  }
}
export function bindRun(directory, config, dataset, runnerHash, registryRoot = join(ROOT, 'benchmark-private/experiment-bindings')) {
  const path = join(directory, 'run-binding.json');
  const binding = { schemaVersion: 1, configHash: canonicalHash(config), datasetHash: canonicalHash(dataset), runnerHash };
  // An approved experiment cannot acquire a fresh budget by selecting a new directory.
  // Exclusive creation wins across concurrent processes; a torn record fails closed.
  mkdirSync(registryRoot, { recursive: true });
  const registryPath = join(registryRoot, `${canonicalHash(binding)}.json`);
  const entry = { ...binding, runDirectory: resolve(directory) };
  let fd;
  try { fd = openSync(registryPath, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (canonicalHash(readJson(registryPath)) !== canonicalHash(entry)) throw new Error('This approved experiment is already bound to another run directory', { cause: error });
  }
  if (fd !== undefined) {
    try { writeFileSync(fd, JSON.stringify(entry) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  }
  writeArtifact(path, binding, { once: true });
}
function checkLedger(ledger) {
  if (ledger.snapshot().outcomes.unknown || ledger.snapshot().outcomes.reserved) throw new Error('Unknown provider outcome requires manual billing reconciliation; no further request is authorized');
}
function verifyPriorRecord(record, request, body, provider) {
  if (!record || record.state === 'reserved' || record.state === 'unknown' || record.requestHash !== requestHash(provider, body) || record.caseId !== request.caseId || record.arm !== request.arm || record.stage !== request.stage || record.reserveMicros !== request.reserveMicros) throw new Error('Prior request is uncertain or mismatched; automatic retry is prohibited');
}
export function verifiedReviewRows({ config, dataset, frozen, plan, ledger, artifact }) {
  if (artifact.planHash !== plan.planHash || artifact.datasetHash !== canonicalHash(dataset) || artifact.sourcesHash !== canonicalHash(frozen) || !Array.isArray(artifact.results) || !Array.isArray(artifact.rows)) throw new Error('Review artifact plan mismatch');
  const results = new Map();
  for (const result of artifact.results) {
    exact(result, ['requestId', 'outcome', 'output'], 'review result');
    const request = plan.requests.find(r => r.requestId === result.requestId);
    if (!request || results.has(result.requestId)) throw new Error('Unknown or duplicate review result');
    const c = dataset.cases.find(c => c.id === request.caseId);
    const sources = request.arm === 'B' ? [] : frozen.packets.find(p => p.caseId === c.id).sources;
    const record = ledger.lookup(result.requestId);
    if (!record || record.state !== result.outcome || record.requestHash !== requestHash('model', buildModelBody(c, sources, config))) throw new Error('Review result ledger mismatch');
    if (record.state === 'completed') {
      validateOutput(result.output, sources);
      if (canonicalHash(result.output) !== record.result.validatedOutputHash) throw new Error('Review output hash mismatch');
    } else if (result.output !== null) throw new Error('Unsuccessful response cannot become a review output');
    results.set(result.requestId, result);
  }
  const rows = [];
  for (const c of dataset.cases) for (let replicate = 1; replicate <= config.replicates; replicate++) {
    const caseId = `${c.id}__R${replicate}`;
    rows.push({ caseId, arm: 'A', output: deterministicBaseline(c) });
    for (const arm of ['B', 'C']) rows.push({ caseId, arm, output: results.get(`model-${c.id}-${arm}-${replicate}`)?.output ?? null });
  }
  if (canonicalHash(rows) !== canonicalHash(artifact.rows)) throw new Error('Blind row integrity mismatch');
  return rows;
}
export async function collectSources({ dataset, plan, directory, ledger, apiKey, transport, signal, beforeRequest = () => {} }) {
  const checkpointPath = join(directory, 'retrieval-checkpoint.json');
  const saved = existsSync(checkpointPath) ? readJson(checkpointPath) : { planHash: plan.planHash, packets: [] };
  if (saved.planHash !== plan.planHash || !Array.isArray(saved.packets)) throw new Error('Retrieval checkpoint mismatch');
  const packets = [];
  for (const request of plan.requests) {
    if (signal?.aborted) break;
    checkLedger(ledger);
    const c = dataset.cases.find(c => c.id === request.caseId), body = searchBody(c);
    const prior = ledger.lookup(request.requestId), stored = saved.packets.find(p => p.caseId === c.id);
    if (prior) {
      verifyPriorRecord(prior, request, body, 'search');
      if (!stored || stored.outcome !== prior.state) throw new Error('Provider response exists without a durable source checkpoint; reconcile manually');
      exact(stored, ['caseId', 'requestId', 'outcome', 'sources'], 'retrieval checkpoint');
      if (prior.state === 'completed' && prior.result.validatedOutputHash !== canonicalHash(stored.sources)) throw new Error('Retrieved passage checkpoint hash mismatch');
      packets.push(stored);
      continue;
    }
    if (stored) throw new Error('Checkpoint has no provider reservation');
    beforeRequest();
    let packet;
    try {
      const { value } = await performRequest({ ledger, ...request, body, apiKey, transport, signal, validate: raw => extractSearchSources(raw, c) });
      packet = { caseId: c.id, requestId: request.requestId, outcome: 'completed', sources: value };
    } catch (error) {
      if (!ledger.lookup(request.requestId)) throw error;
      packet = { caseId: c.id, requestId: request.requestId, outcome: ledger.lookup(request.requestId).state, sources: [] };
    }
    packets.push(packet);
    writeArtifact(checkpointPath, { planHash: plan.planHash, packets });
    checkLedger(ledger);
  }
  if (packets.length !== dataset.cases.length) throw new Error('Retrieval interrupted before source freeze');
  const frozen = { schemaVersion: 1, datasetHash: canonicalHash(dataset), retrievalPlanHash: plan.planHash, packets };
  validateFrozen(frozen, dataset);
  writeArtifact(join(directory, 'frozen-sources.json'), frozen, { once: true });
  return frozen;
}
export async function runInference({ config, dataset, frozen, plan, directory, ledger, apiKey, transport, signal, beforeRequest = () => {} }) {
  const checkpointPath = join(directory, 'inference-checkpoint.json');
  const saved = existsSync(checkpointPath) ? readJson(checkpointPath) : { planHash: plan.planHash, results: [] };
  if (saved.planHash !== plan.planHash || !Array.isArray(saved.results)) throw new Error('Inference checkpoint mismatch');
  const results = [];
  let stopError;
  try {
  for (const request of plan.requests) {
    if (signal?.aborted) break;
    checkLedger(ledger);
    const c = dataset.cases.find(c => c.id === request.caseId);
    const sources = request.arm === 'B' ? [] : frozen.packets.find(p => p.caseId === c.id).sources;
    const body = buildModelBody(c, sources, config);
    const prior = ledger.lookup(request.requestId), stored = saved.results.find(r => r.requestId === request.requestId);
    if (prior) {
      verifyPriorRecord(prior, request, body, 'model');
      if (!stored || stored.outcome !== prior.state) throw new Error('Provider response exists without an output checkpoint; reconcile manually');
      exact(stored, ['requestId', 'outcome', 'output'], 'inference checkpoint');
      if (prior.state === 'completed') {
        validateOutput(stored.output, sources);
        if (prior.result.validatedOutputHash !== canonicalHash(stored.output)) throw new Error('Completed output checkpoint hash mismatch');
      } else if (stored.output !== null) throw new Error('Failed model output must remain missing');
      results.push(stored);
      continue;
    }
    if (stored) throw new Error('Checkpoint has no provider reservation');
    beforeRequest();
    let result;
    try {
      const { value } = await performRequest({ ledger, ...request, body, apiKey, transport, signal, validate: raw => extractCompletion(raw, sources) });
      result = { requestId: request.requestId, outcome: 'completed', output: value };
    } catch (error) {
      if (!ledger.lookup(request.requestId)) throw error;
      result = { requestId: request.requestId, outcome: ledger.lookup(request.requestId).state, output: null };
    }
    results.push(result);
    writeArtifact(checkpointPath, { planHash: plan.planHash, results });
    checkLedger(ledger);
  }
  } catch (error) { stopError = error; }
  const rows = [];
  for (const c of dataset.cases) for (let replicate = 1; replicate <= config.replicates; replicate++) {
    const caseId = `${c.id}__R${replicate}`;
    rows.push({ caseId, arm: 'A', output: deterministicBaseline(c) });
    for (const arm of ['B', 'C']) {
      const requestId = `model-${c.id}-${arm}-${replicate}`, result = results.find(r => r.requestId === requestId);
      rows.push({ caseId, arm, output: result?.output ?? null });
    }
  }
  const artifact = { schemaVersion: 1, status: !stopError && results.length === plan.requests.length ? 'awaiting-human-review' : 'incomplete', planHash: plan.planHash, datasetHash: canonicalHash(dataset), sourcesHash: canonicalHash(frozen), independentCaseCount: dataset.cases.length, replicates: config.replicates, results, rows, ledger: ledger.snapshot(), interpretation: 'No semantic score or superiority claim; failures remain null. Two replicates are clustered within each independent case. Costs without billing reconciliation remain unknown.' };
  // Preserve the first interrupted report if a later resume is rejected before reading any records.
  if (results.length || !existsSync(join(directory, 'results-private.json'))) writeArtifact(join(directory, 'results-private.json'), artifact);
  if (stopError) throw stopError;
  return artifact;
}
function args(argv) {
  const [command, ...rest] = argv, options = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!['--config', '--dataset', '--approval', '--run-dir', '--reviews', '--adjudications', '--recover-stale-lock'].includes(key) || key in options) throw new Error('Unknown or duplicate option');
    options[key] = key === '--recover-stale-lock' ? true : rest[++i];
    if (!options[key]) throw new Error('Missing option value');
  }
  return { command, options };
}
export async function main(argv = process.argv.slice(2)) {
  const { command, options } = args(argv);
  if (!['plan', 'collect', 'infer', 'blind', 'score'].includes(command)) throw new Error('Usage: node scripts/benchmark/run.mjs plan|collect|infer|blind|score --config FILE --dataset FILE [--run-dir benchmark-private/final-run] [--approval FILE]');
  const directory = resolve(ROOT, options['--run-dir'] || 'benchmark-private/final-run');
  const privateRoot = resolve(ROOT, 'benchmark-private');
  if (!relative(privateRoot, directory) || relative(privateRoot, directory).startsWith('..') || relative(privateRoot, directory).includes(':')) throw new Error('Use a dedicated run directory beneath benchmark-private/');
  if (command === 'blind') {
    const config = validateConfig(readJson(options['--config'])), dataset = validateDataset(readJson(options['--dataset']));
    const frozen = readJson(join(directory, 'frozen-sources.json')), plan = makePlan(config, dataset, frozen), b = config.budget;
    const ledger = new RequestLedger({ directory, maxHttpRequests: b.maxHttpRequests, providerLimits: { model: b.maxModelRequests, search: b.maxSearchRequests }, maxReservedMicros: b.maxReservedMicros, reclaimLock: options['--recover-stale-lock'] === true });
    let rows;
    try {
      const artifact = readJson(join(directory, 'results-private.json'));
      verifyFrozenLineage(frozen, dataset, config, ledger, frozen);
      rows = verifiedReviewRows({ config, dataset, frozen, plan, ledger, artifact });
    } finally { ledger.close(); }
    const seedPath = join(directory, 'blind-seed-private.json');
    const seed = existsSync(seedPath) ? readJson(seedPath).seed : randomBytes(32).toString('hex');
    writeArtifact(seedPath, { seed }, { once: true });
    const { packet, mapping } = createBlindPacket(rows, { seed });
    writeArtifact(join(directory, 'blind-packet.json'), packet, { once: true });
    writeArtifact(join(directory, 'blind-mapping-private.json'), mapping, { once: true });
    console.log('Blind packet created; mapping, seed, source provenance and raw results remain private.');
    return;
  }
  if (command === 'score') {
    const report = scoreBlindReviews(readJson(join(directory, 'blind-mapping-private.json')), readJson(options['--reviews']), { adjudications: options['--adjudications'] ? readJson(options['--adjudications']) : [] });
    writeArtifact(join(directory, 'human-review-summary.json'), report);
    console.log(`Human review status: ${report.status}. No automated superiority claim.`);
    return;
  }
  const config = validateConfig(readJson(options['--config'])), dataset = validateDataset(readJson(options['--dataset']));
  const frozenPath = join(directory, 'frozen-sources.json');
  const frozen = existsSync(frozenPath) ? readJson(frozenPath) : undefined;
  const plan = makePlan(config, dataset, command === 'collect' ? undefined : frozen), runnerHash = runnerFingerprint();
  if (command === 'plan') {
    console.log(JSON.stringify({ ...plan, runnerHash, readiness: Object.values(config.readiness).every(Boolean) ? 'requires-explicit-final-execution-approval' : 'closed', note: 'Offline plan only. No keys loaded, provider requests or final experiment executed. Reservation values are supplied upper bounds, not measured costs.' }, null, 2));
    return;
  }
  if (process.env.MARGINGUARD_FINAL_BENCHMARK !== 'I_APPROVE_FINAL_PAID_RUN' || !options['--approval']) throw new Error('Paid final execution is disabled; explicit environment gate and plan approval are required');
  const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim() === '';
  const approval = readJson(options['--approval']);
  const beforeRequest = () => assertExecutionReady(plan, dataset, approval, currentCommit, clean, runnerHash);
  beforeRequest();
  if (command === 'infer' && !frozen) throw new Error('Collect and freeze sources before paired inference');
  const key = command === 'collect' ? process.env.TAVILY_API_KEY : process.env.NEBIUS_API_KEY;
  if (!key) throw new Error('Explicit provider key is missing; no request dispatched');
  bindRun(directory, config, dataset, runnerHash);
  const b = config.budget;
  const ledger = new RequestLedger({ directory, maxHttpRequests: b.maxHttpRequests, providerLimits: { model: b.maxModelRequests, search: b.maxSearchRequests }, maxReservedMicros: b.maxReservedMicros, reclaimLock: options['--recover-stale-lock'] === true });
  const controller = new globalThis.AbortController(), stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    checkLedger(ledger);
    writeArtifact(join(directory, `${plan.phase}-plan.json`), { ...plan, runnerHash }, { once: true });
    if (command === 'collect') await collectSources({ config, dataset, plan, directory, ledger, apiKey: key, signal: controller.signal, beforeRequest });
    else {
      verifyFrozenLineage(frozen, dataset, config, ledger, readJson(frozenPath));
      const checkpoint = readJson(join(directory, 'retrieval-checkpoint.json'));
      if (checkpoint.planHash !== frozen.retrievalPlanHash || canonicalHash(checkpoint.packets) !== canonicalHash(frozen.packets)) throw new Error('Frozen passages differ from the retrieval checkpoint');
      const result = await runInference({ config, dataset, frozen, plan, directory, ledger, apiKey: key, signal: controller.signal, beforeRequest });
      if (result.status === 'incomplete') throw new Error('Inference interrupted; full missing-output denominator retained');
    }
    console.log(`${plan.phase} phase finished; artifacts are private and human review remains required.`);
  } finally {
    try { writeArtifact(join(directory, 'ledger-summary-private.json'), ledger.snapshot()); }
    finally {
      ledger.close();
      process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    }
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Benchmark stopped. Check offline plan, readiness, private checkpoint and ledger; no automatic retry was made.'); process.exitCode = 1; });
}
