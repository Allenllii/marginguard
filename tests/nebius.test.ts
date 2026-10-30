import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { completionControls, explain, fixture, modelEvidence, remediate, validateOutput } from '../server/nebius.js';
import type { ResearchPacket } from '../shared/types.js';
const analysis = analyze(createDemoCsv());
const config = { key: 'test-fixture-never-a-real-key', model: 'nvidia/test-model', enabled: true };
const valid = () => ({ summary: 'Review the largest exposure and validate its source evidence before a corrective test.', priorities: modelEvidence(analysis).map(i => ({ issueId: i.evidence_id, reason: 'This finding is supported by the supplied rule and source evidence.', nextStep: 'Review the affected process and run a small controlled operational test.' })), caveat: 'Scenarios are assumptions and do not guarantee recoveries.' });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': 'fixture-request' } });
function mockCompletion(body: unknown, overrides: object = {}): typeof fetch {
  let calls = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls++;
    if (calls === 1) { assert.ok(String(url).endsWith('/models')); return response({ data: [{ id: config.model }] }); }
    const sent = JSON.parse(String(init?.body));
    assert.equal(sent.model, config.model);
    assert.ok(!sent.messages[1].content.includes('CLOUD-HOODIE'));
    assert.ok(!sent.messages[1].content.includes('MG-0001'));
    return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(body) } }], usage: { prompt_tokens: 100, completion_tokens: 80 }, ...overrides });
  }) as typeof fetch;
}
test('offline mode never calls a provider', async () => {
  const result = await explain(analysis, false, config, (() => { throw new Error('must not call'); }) as typeof fetch);
  assert.equal(result.mode, 'fixture'); assert.equal(result.proof, undefined);
  assert.equal(fixture(analysis).model, null);
});
test('configured adapter verifies catalogue, validates output and records measured proof', async () => {
  const result = await explain(analysis, true, config, mockCompletion(valid()));
  assert.equal(result.mode, 'live'); assert.equal(result.model, config.model);
  assert.equal(result.proof?.requestId, 'fixture-request'); assert.equal(result.proof?.inputTokens, 100);
  assert.deepEqual(result.priorities.map(i => i.issueId), analysis.issues.map(i => i.id));
});
test('raw identifiers and imported prose are excluded from model evidence', () => {
  const evidence = JSON.stringify(modelEvidence(analysis));
  assert.ok(!evidence.includes('HOODIE')); assert.ok(!evidence.includes('Northstar')); assert.ok(!evidence.includes('category'));
});
test('unknown references, duplicate references, and numeric claims are rejected', async () => {
  for (const bad of [ { ...valid(), summary: 'Save $100 with certainty on your next sale.' }, { ...valid(), priorities: [] }, { ...valid(), priorities: valid().priorities.map(p => ({ ...p, issueId: 'unknown' })) } ]) {
    const result = await explain(analysis, true, config, mockCompletion(bad));
    assert.equal(result.mode, 'fixture'); assert.ok(result.fallbackReason); assert.equal(result.proof, undefined);
  }
});
test('truncated or refused responses visibly fall back', async () => {
  for (const choices of [[{ finish_reason: 'length', message: { content: JSON.stringify(valid()) } }], [{ finish_reason: 'stop', message: { content: null, refusal: 'declined' } }]]) {
    assert.equal((await explain(analysis, true, config, mockCompletion(valid(), { choices }))).mode, 'fixture');
  }
});
test('missing config, non-NVIDIA model, unavailable catalogue model and upstream failure do not claim success', async () => {
  assert.equal((await explain(analysis, true, {})).mode, 'fixture');
  assert.equal((await explain(analysis, true, { ...config, model: 'deepseek-ai/test' })).mode, 'fixture');
  assert.equal((await explain(analysis, true, config, (async () => response({ data: [] })) as typeof fetch)).mode, 'fixture');
  assert.equal((await explain(analysis, true, config, (async () => response({}, 500)) as typeof fetch)).mode, 'fixture');
});
test('output schema rejects extra fields and markup', () => {
  assert.throws(() => validateOutput({ ...fixture(analysis), action: 'execute' }, analysis));
  const { summary, priorities, caveat } = fixture(analysis);
  assert.throws(() => validateOutput({ summary: summary + '<script>', priorities, caveat }, analysis));
});

test('only the documented hosted Lightning profile disables thinking, without increasing token limits', async () => {
  const model = 'nvidia/Nemotron-3_5-Lightning';
  assert.deepEqual(completionControls(model), { store: false, chat_template_kwargs: { enable_thinking: false } });
  assert.deepEqual(completionControls('nvidia/custom-deployment'), { store: false });
  const bodies: Record<string, unknown>[] = [];
  const mock = (content: unknown): typeof fetch => (async (_url, init) => {
    if (!init?.body) return response({ data: [{ id: model }] });
    const body = JSON.parse(String(init.body)); bodies.push(body);
    return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });
  }) as typeof fetch;
  const brief = await explain(analysis, true, { ...config, model }, mock(valid()));
  assert.equal(brief.mode, 'live');
  const packet: ResearchPacket = { researchId: 'mock-not-live-proof', mode: 'live', status: 'ok', kind: 'discount', context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' }, checkedAt: null, query: 'synthetic fixture', note: 'Mock provider packet only.', sources: [{ id: 'S1', title: 'Synthetic manual override exception', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', snippet: 'Manual POS and draft-order discounts apply regardless of combination settings.', publishedDate: null, sourceRegion: 'global' }] };
  const policy = { documentedPolicy: [{ sourceId: 'S1', statement: 'The returned passage describes a manual-discount exception to combination settings.' }], inference: 'An override audit is a review candidate and does not establish the cause.', nextStep: 'Inspect staff overrides and promotion intent before changing combination settings.', uncertainty: 'Confirm applicable transaction scope, store eligibility and the policy effective date.' };
  assert.equal((await remediate(analysis.issues.find(i => i.kind === 'discount')!, packet, true, { ...config, model }, mock(policy))).mode, 'live');
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies.map(b => b.max_tokens), [1600, 1400]);
  assert.ok(bodies.every(b => b.store === false && JSON.stringify(b.chat_template_kwargs) === '{"enable_thinking":false}' && b.model === model));
});

test('brief input carries no numbers and digit-free evidence IDs, so a compliant brief can cite findings and pass the no-digits rule', async () => {
  const evidence = modelEvidence(analysis);
  assert.ok(!/\d/.test(JSON.stringify(evidence)), 'model evidence must not contain digits');
  assert.deepEqual(evidence.map(e => e.exposure_rank).slice(0, 3), ['largest', 'second largest', 'third largest'].slice(0, evidence.length));
  let system = '';
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith('/models')) return response({ data: [{ id: config.model }] });
    const sent = JSON.parse(String(init?.body)); system = sent.messages[0].content;
    assert.ok(!/\d/.test(sent.messages[1].content), 'user message must not contain digits');
    const cited = { ...valid(), priorities: evidence.map(e => ({ issueId: e.evidence_id, reason: `Finding ${e.evidence_id} is the ${e.exposure_rank} modeled exposure.`, nextStep: 'Review the affected process and run a small controlled operational test.' })) };
    return response({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(cited) } }] });
  }) as typeof fetch;
  const result = await explain(analysis, true, config, request);
  assert.match(system, /only by its evidence_id/);
  assert.equal(result.mode, 'live');
  assert.deepEqual(result.priorities.map(p => p.issueId), analysis.issues.map(i => i.id));
  // The validator itself is unchanged: digits in prose still fall back.
  const withDigits = await explain(analysis, true, config, mockCompletion({ ...valid(), summary: 'Start with the finding worth about six hundred dollars, row 12.' }));
  assert.equal(withDigits.mode, 'fixture');
});
