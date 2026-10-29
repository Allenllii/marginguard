import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalHash } from './ledger.mjs';
import {
  STRATA, SYSTEM, OUTPUT_SCHEMA, validateCase, validateDataset, validateConfig, validateSources,
  validateFrozen, buildModelBody, searchBody, extractSearchSources, validateOutput, extractCompletion,
  deterministicBaseline, makePlan, assertExecutionReady,
} from './core.mjs';

// TEST-ONLY structural scaffolds. These are not independently authored holdouts or benchmark results.
const clone = value => globalThis.structuredClone(value);
const sampleCase = (id = 'test-only-H01', stratum = STRATA[0]) => ({ id, stratum, kind: 'discount',
  context: { platform: 'Shopify', carrier: 'UPS', region: 'US', discountOrigin: 'native' },
  issue: { affectedOrders: 8, modeledExposureCents: 12000, thresholdBasisPoints: 2000 } });
const scaffoldDataset = () => ({ schemaVersion: 1, datasetId: 'test-only-scaffolds', partition: 'independent-holdout', synthetic: true,
  cases: STRATA.flatMap((stratum, s) => Array.from({ length: 4 }, (_, i) => ({ ...sampleCase(`test-only-H${s * 4 + i + 1}`, stratum), issue: { affectedOrders: s * 4 + i, modeledExposureCents: 12000 + i, thresholdBasisPoints: 2000 } }))) });
const configFor = dataset => ({ schemaVersion: 1, releaseCommit: 'a'.repeat(40), datasetHash: canonicalHash(dataset),
  model: 'nvidia/Nemotron-3_5-Lightning', temperature: 0, maxTokens: 800, replicates: 2,
  budget: { maxHttpRequests: 120, maxModelRequests: 96, maxSearchRequests: 24, maxReservedMicros: 1200000, modelRequestReserveMicros: 10000, searchRequestReserveMicros: 10000 },
  readiness: { projectComplete: true, holdoutSealedByIndependentAuthor: true, goldSeparated: true, pricingUpperBoundsReviewed: true, providerBillingBoundaryReviewed: true } });
const source = () => ({ id: 'S1', url: 'https://help.shopify.com/en/manual/discounts', title: 'TEST ONLY source', text: 'TEST ONLY: inspect eligible combination classes and active settings.' });
const frozenFor = dataset => ({ schemaVersion: 1, datasetHash: canonicalHash(dataset), retrievalPlanHash: 'b'.repeat(64),
  packets: dataset.cases.map(c => ({ caseId: c.id, requestId: `search-${c.id}`, outcome: 'completed', sources: [source()] })) });
const validOutput = () => ({ status: 'review', rationale: 'Review the supplied operative passage.', nextCheck: 'Inspect a flagged transaction.', disconfirmingEvidence: 'The transaction and effective policy may disprove the hypothesis.', sourceIds: ['S1'] });
const completion = (output, finish_reason = 'stop') => ({ choices: [{ finish_reason, message: { content: JSON.stringify(output) } }] });

test('B/C model request bytes differ only in the frozen source package', () => {
  const dataset = scaffoldDataset(), config = configFor(dataset), c = dataset.cases[0];
  const b = buildModelBody(c, [], config), augmented = buildModelBody(c, [source()], config);
  const bUser = JSON.parse(b.messages[1].content), cUser = JSON.parse(augmented.messages[1].content);
  assert.deepEqual(bUser.sources, []);
  assert.deepEqual(cUser.sources, [source()]);
  cUser.sources = [];
  augmented.messages[1].content = JSON.stringify(cUser);
  assert.equal(JSON.stringify(b), JSON.stringify(augmented));
  assert.equal(b.messages[0].content, SYSTEM);
  assert.deepEqual(bUser.outputSchema, OUTPUT_SCHEMA);
  assert.deepEqual(Object.keys(bUser).sort(), ['context', 'kind', 'outputSchema', 'sellerAssumptionMetrics', 'sources', 'task']);
  assert.equal(JSON.stringify(b).includes(c.id), false);
  assert.equal(JSON.stringify(b).includes(c.stratum), false);
  assert.equal(JSON.stringify(b).includes('test-only-scaffolds'), false);
  for (const field of ['caseId', 'stratum', 'gold', 'expected', 'schemaVersion', 'partition', 'readiness', 'budget', 'releaseCommit', 'datasetHash']) {
    assert.equal(Object.hasOwn(bUser, field), false, field);
  }
  assert.equal(b.model, config.model);
  assert.equal(b.max_tokens, config.maxTokens);
  assert.equal(b.temperature, config.temperature);
  assert.deepEqual(b.chat_template_kwargs, { enable_thinking: false });
});

test('gold, desired answers, free-form hints and unknown fields are rejected before prompt construction', () => {
  const c = sampleCase(), config = configFor(scaffoldDataset());
  for (const field of ['gold', 'expected', 'answer', 'nextCheck', 'passage', 'outputSchema']) {
    assert.throws(() => buildModelBody({ ...c, [field]: 'LEAKED ANSWER' }, [], config), /Invalid case/);
  }
  assert.throws(() => validateCase({ ...c, context: { ...c.context, expected: 'review' } }), /context/);
  assert.throws(() => validateCase({ ...c, issue: { ...c.issue, gold: 'review' } }), /issue/);
  const dataset = scaffoldDataset();
  assert.throws(() => validateDataset({ ...dataset, goldSchema: {} }), /dataset/);
  assert.throws(() => validateSources([{ ...source(), expectedStatus: 'review' }], c), /source/);
  assert.equal(JSON.stringify(searchBody(c)).includes(c.stratum), false);
  assert.equal(JSON.stringify(searchBody(c)).includes(c.id), false);
  assert.equal(searchBody(c).include_answer, false);
});

test('final dataset gating enforces the complete stratified roster and strict synthetic contract', () => {
  const dataset = scaffoldDataset();
  assert.deepEqual(validateDataset(dataset, true), dataset);
  assert.throws(() => validateDataset({ ...dataset, partition: 'development' }, true), /24 independent/);
  assert.throws(() => validateDataset({ ...dataset, cases: dataset.cases.slice(1) }, true), /24 independent/);
  assert.throws(() => validateDataset({ ...dataset, synthetic: false }, true), /synthetic/);
  const unbalanced = clone(dataset); unbalanced.cases[0].stratum = STRATA[1];
  assert.throws(() => validateDataset(unbalanced, true), /four/);
  const duplicate = clone(dataset); duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateDataset(duplicate), /Duplicate/);
  const leaky = clone(dataset); leaky.cases[0].gold = 'hold';
  assert.throws(() => validateDataset(leaky), /no gold/);
  const returned = validateDataset(dataset, true); returned.cases[0].context.platform = 'WooCommerce';
  assert.equal(dataset.cases[0].context.platform, 'Shopify');
});

test('config rejects malformed bounds, unknown model controls and implicit readiness', () => {
  const config = configFor(scaffoldDataset());
  assert.deepEqual(validateConfig(config), config);
  for (const [key, value] of [['releaseCommit', 'main'], ['datasetHash', 'unknown'], ['model', 'https://model.invalid'], ['temperature', NaN], ['temperature', 1.1], ['maxTokens', 0], ['maxTokens', 1601], ['replicates', 1]]) {
    assert.throws(() => validateConfig({ ...config, [key]: value }), undefined, key);
  }
  assert.throws(() => validateConfig({ ...config, seed: 1 }), /config/);
  assert.throws(() => validateConfig({ ...config, budget: { ...config.budget, maxHttpRequests: 121 } }), /HTTP cap/);
  assert.throws(() => validateConfig({ ...config, budget: { ...config.budget, modelRequestReserveMicros: 0 } }), /ReserveMicros/);
  assert.throws(() => validateConfig({ ...config, readiness: { ...config.readiness, goldSeparated: 'true' } }), /booleans/);
});

test('deterministic A is reproducible, conservative and validates against the common output schema', () => {
  const c = sampleCase();
  const first = deterministicBaseline(c);
  assert.deepEqual(first, deterministicBaseline(c));
  assert.deepEqual(validateOutput(first, []), first);
  assert.equal(first.status, 'insufficient');
  for (const discountOrigin of ['unknown', 'app', 'app-script', 'manual', 'scripts-api']) {
    assert.equal(deterministicBaseline({ ...c, context: { ...c.context, discountOrigin } }).status, 'hold');
  }
  assert.equal(deterministicBaseline({ ...c, context: { ...c.context, region: 'UK' } }).status, 'hold');
  assert.deepEqual(first.sourceIds, []);
});

test('completion validation rejects refusal, truncation, invalid JSON, extra keys and unsupported citations', () => {
  const output = validOutput(), sources = [source()];
  assert.deepEqual(extractCompletion(completion(output), sources), output);
  for (const finish of ['length', 'content_filter', 'tool_calls', null]) assert.throws(() => extractCompletion(completion(output, finish), sources), /Refused, truncated/);
  const refused = completion(output); refused.choices[0].message.refusal = 'declined';
  assert.throws(() => extractCompletion(refused, sources), /Refused/);
  assert.throws(() => extractCompletion({ choices: [] }, sources), /invalid completion/);
  assert.throws(() => extractCompletion({ choices: [...completion(output).choices, ...completion(output).choices] }, sources), /invalid completion/);
  assert.throws(() => extractCompletion({ choices: [{ finish_reason: 'stop', message: { content: '{' } }] }, sources));
  assert.throws(() => validateOutput({ ...output, semanticScore: 1 }, sources), /model output/);
  assert.throws(() => validateOutput({ ...output, sourceIds: ['S2'] }, sources), /Unknown citation/);
  assert.throws(() => validateOutput({ ...output, sourceIds: ['S1', 'S1'] }, sources), /Unknown citation/);
  assert.throws(() => validateOutput({ ...output, rationale: 'x'.repeat(1601) }, sources), /prose/);
  // A syntactically valid prohibited claim must still be assessed by blinded humans.
  const unsupported = { ...output, rationale: 'Guaranteed recovery; policy proves the root cause.' };
  assert.deepEqual(validateOutput(unsupported, sources), unsupported);
  assert.equal(Object.hasOwn(validateOutput(unsupported, sources), 'semanticScore'), false);
});

test('frozen sources enforce official hosts, scheme, userinfo, query, fragment and port boundaries', () => {
  const c = sampleCase();
  assert.deepEqual(validateSources([source()], c), [source()]);
  for (const url of ['http://help.shopify.com/a', 'https://help.shopify.com.evil.test/a', 'https://evil.test/a', 'https://name@help.shopify.com/a', 'https://name:secret@help.shopify.com/a', 'https://help.shopify.com/a?customer=secret', 'https://help.shopify.com/a#secret', 'https://help.shopify.com:8443/a']) {
    assert.throws(() => validateSources([{ ...source(), url }], c), undefined, url);
  }
  assert.throws(() => validateSources([{ ...source(), id: 'expected-review' }], c), /source/);
  assert.throws(() => validateSources([{ ...source(), text: 'x'.repeat(3001) }], c), /source/);
  assert.throws(() => validateSources([{ ...source(), text: 'bad\u0001passage' }], c), /source/);
  const raw = { answer: 'DO NOT USE ANSWER', results: [
    { url: 'https://help.shopify.com.evil.test/a', title: 'Bad', content: 'Bad' },
    { url: 'https://user@help.shopify.com/a', title: 'Bad', content: 'Bad' },
    { url: 'https://help.shopify.com:8443/a', title: 'Bad', content: 'Bad' },
    { url: 'https://help.shopify.com/a?tracking=private#private', title: 'Allowed', content: 'Usable policy clause' },
    { url: 'https://help.shopify.com/a?duplicate=1', title: 'Duplicate', content: 'Duplicate clause' },
  ] };
  assert.deepEqual(extractSearchSources(raw, c), [{ id: 'S1', url: 'https://help.shopify.com/a', title: 'Allowed', text: 'Usable policy clause' }]);
  assert.equal(JSON.stringify(extractSearchSources(raw, c)).includes('DO NOT USE ANSWER'), false);
});

test('frozen manifests reject mismatched or duplicate packets, unsafe payloads and unearned source results', () => {
  const dataset = scaffoldDataset(), frozen = frozenFor(dataset);
  assert.deepEqual(validateFrozen(frozen, dataset), frozen);
  const badHash = { ...frozen, datasetHash: '0'.repeat(64) };
  assert.throws(() => validateFrozen(badHash, dataset), /mismatch/);
  const duplicated = clone(frozen); duplicated.packets[1] = clone(duplicated.packets[0]);
  assert.throws(() => validateFrozen(duplicated, dataset), /duplicate/);
  const wrongRequest = clone(frozen); wrongRequest.packets[0].requestId = 'search-other';
  assert.throws(() => validateFrozen(wrongRequest, dataset), /mismatch/);
  const failedWithSources = clone(frozen); failedWithSources.packets[0].outcome = 'unknown';
  assert.throws(() => validateFrozen(failedWithSources, dataset), /cannot supply/);
  const failedWithoutSources = clone(frozen); failedWithoutSources.packets[0].outcome = 'failed'; failedWithoutSources.packets[0].sources = [];
  assert.deepEqual(validateFrozen(failedWithoutSources, dataset), failedWithoutSources);
  assert.throws(() => validateFrozen({ ...frozen, gold: 'review' }, dataset), /frozen sources/);
});

test('plans declare 24 retrieval and 96 model attempts, with no discovery or retry requests', () => {
  const dataset = scaffoldDataset(), config = configFor(dataset), frozen = frozenFor(dataset);
  const retrieval = makePlan(config, dataset), inference = makePlan(config, dataset, frozen);
  assert.equal(retrieval.phase, 'retrieval'); assert.equal(inference.phase, 'inference');
  assert.equal(retrieval.requests.length, 24); assert.equal(inference.requests.length, 96);
  assert.ok(retrieval.requests.every(request => request.provider === 'search'));
  assert.ok(inference.requests.every(request => request.provider === 'model'));
  assert.equal(new Set(inference.requests.map(request => request.requestId)).size, 96);
  for (const [index, c] of dataset.cases.entries()) {
    const requests = inference.requests.filter(request => request.caseId === c.id);
    assert.deepEqual(requests.map(request => `${request.arm}${request.replicate}`).sort(), ['B1', 'B2', 'C1', 'C2']);
    assert.deepEqual(requests.map(request => request.arm), index % 2 ? ['C', 'B', 'B', 'C'] : ['B', 'C', 'C', 'B']);
    assert.equal(requests.find(request => request.arm === 'B' && request.replicate === 1).bodyHash, requests.find(request => request.arm === 'B' && request.replicate === 2).bodyHash);
    assert.equal(requests.find(request => request.arm === 'C' && request.replicate === 1).bodyHash, requests.find(request => request.arm === 'C' && request.replicate === 2).bodyHash);
  }
  assert.notEqual(inference.planHash, retrieval.planHash);
  const changed = clone(frozen); changed.packets[0].sources[0].text = 'New frozen policy text';
  assert.notEqual(makePlan(config, dataset, changed).planHash, inference.planHash);
});

test('execution requires exact plan and runner approval, future expiry, final readiness, clean pinned commit and full budget', () => {
  const dataset = scaffoldDataset(), config = configFor(dataset), plan = makePlan(config, dataset, frozenFor(dataset));
  const runnerHash = 'c'.repeat(64), approval = { planHash: plan.planHash, runnerHash, approved: true, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
  assert.doesNotThrow(() => assertExecutionReady(plan, dataset, approval, config.releaseCommit, true, runnerHash));
  for (const change of [{ approved: false }, { planHash: '0'.repeat(64) }, { runnerHash: '0'.repeat(64) }, { expiresAt: 'never' }, { expiresAt: new Date(Date.now() - 1000).toISOString() }, { expiresAt: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() }]) {
    assert.throws(() => assertExecutionReady(plan, dataset, { ...approval, ...change }, config.releaseCommit, true, runnerHash), /approval/);
  }
  assert.throws(() => assertExecutionReady(plan, dataset, approval, 'd'.repeat(40), true, runnerHash), /pinned/);
  assert.throws(() => assertExecutionReady(plan, dataset, approval, config.releaseCommit, false, runnerHash), /clean/);
  const notReady = clone(config); notReady.readiness.projectComplete = false;
  const notReadyPlan = makePlan(notReady, dataset, frozenFor(dataset));
  assert.throws(() => assertExecutionReady(notReadyPlan, dataset, { ...approval, planHash: notReadyPlan.planHash }, config.releaseCommit, true, runnerHash), /gates/);
  const insufficient = clone(config); insufficient.budget.maxReservedMicros = 1;
  const underBudgetPlan = makePlan(insufficient, dataset, frozenFor(dataset));
  assert.throws(() => assertExecutionReady(underBudgetPlan, dataset, { ...approval, planHash: underBudgetPlan.planHash }, config.releaseCommit, true, runnerHash), /entire paired/);
});

test('execution fails closed when approved plan content or its supplied dataset has changed', () => {
  const dataset = scaffoldDataset(), config = configFor(dataset), plan = makePlan(config, dataset, frozenFor(dataset));
  const runnerHash = 'c'.repeat(64), approval = { planHash: plan.planHash, runnerHash, approved: true, expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() };
  const tamperedPlan = clone(plan); tamperedPlan.requests[0].bodyHash = 'f'.repeat(64);
  assert.throws(() => assertExecutionReady(tamperedPlan, dataset, approval, config.releaseCommit, true, runnerHash));
  const changedDataset = clone(dataset); changedDataset.cases[0].issue.affectedOrders++;
  assert.throws(() => assertExecutionReady(plan, changedDataset, approval, config.releaseCommit, true, runnerHash));
});
