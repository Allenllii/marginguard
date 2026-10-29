import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPolicyIntegration, type IntegrationOptions, type IntegrationReport } from '../scripts/lib/verify-policy-integration.js';

const searchUrl = 'https://api.tavily.com/search';
const modelsUrl = 'https://api.tokenfactory.nebius.com/v1/models';
const completionUrl = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
const model = 'nvidia/integration-fixture-model';
const tavilyKey = 'mock-tavily-private-credential';
const nebiusKey = 'mock-nebius-private-credential';
const source = { title: 'Combining discounts', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', content: 'Manual POS and draft order discounts always apply regardless of combination settings. Confirm the originating override and promotion intent.', score: 0.9 };
const draft = {
  documentedPolicy: [{ sourceId: 'S1', statement: 'The returned passage describes a manual-discount exception to combination settings.' }],
  inference: 'A settings change has not been established as a remedy for the observed anomaly.',
  nextStep: 'Audit staff manual overrides and promotion intent on a flagged order before a controlled test.',
  uncertainty: 'Verify the full policy, effective date, store eligibility and account terms; this passage does not establish the anomaly cause.',
};
const reply = (body: unknown, status = 200, requestId = 'mock-request') => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': requestId } });
const completion = (content: unknown = draft, finish = 'stop') => ({ id: 'mock-model-response', choices: [{ finish_reason: finish, message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 120, completion_tokens: 90 } });
const stages = (body: unknown): typeof fetch => (async input => String(input) === searchUrl ? reply({ results: [source] }) : String(input) === modelsUrl ? reply({ data: [{ id: model }] }) : reply(body)) as typeof fetch;

function setup(transport?: typeof fetch, overrides: Partial<IntegrationOptions> = {}) {
  const checkpoints: IntegrationReport[] = [];
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = (async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push({ url, init });
    if (transport) return transport(input, init);
    if (url === searchUrl) return reply({ results: [source], usage: { credits: 1 } }, 200, 'mock-search');
    if (url === modelsUrl) return reply({ data: [{ id: model }] }, 200, 'mock-models');
    if (url === completionUrl) return reply(completion(), 200, 'mock-completion');
    throw new Error('Unexpected mocked endpoint');
  }) as typeof fetch;
  const options: IntegrationOptions = { runId: 'mock-integration-run', approvedLive: true, tavily: { enabled: true, key: tavilyKey }, nebius: { enabled: true, key: nebiusKey, model }, request, checkpoint: async report => { checkpoints.push(report); }, ...overrides };
  return { options, calls, checkpoints, run: () => verifyPolicyIntegration(options) };
}

test('operator integration follows the exact synthetic manual case through one search, catalogue and cited remediation', async () => {
  const harness = setup();
  const report = await harness.run();
  assert.equal(report.scope, 'OPERATOR_INTEGRATION_CHECK_NOT_FINAL_BENCHMARK');
  assert.equal(report.fixture.caseId, 'shopify-us-manual-discount');
  assert.equal(report.fixture.synthetic, true);
  assert.deepEqual(report.fixture.context, { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' });
  assert.ok(report.fixture.affectedRows > 0);
  assert.equal(report.outcome, 'validated-live-model');
  assert.equal(report.validatedLiveModelSuccess, true);
  assert.equal(report.humanPolicyFidelityReview, 'pending');
  assert.equal(report.decision?.status, 'contradicted');
  assert.equal(report.remediation?.mode, 'live');
  assert.equal(report.remediation?.model, model);
  assert.equal(report.modelDiagnostic?.validation, 'accepted');
  assert.equal(report.modelDiagnostic?.schemaIssues, null);
  assert.deepEqual(report.modelDiagnostic?.usage, { promptTokens: 120, completionTokens: 90, totalTokens: null, reasoningTokens: null });
  assert.equal(report.http.maximumApprovedHttpRequests, 3);
  assert.equal(report.http.attemptedHttpRequests, 3);
  assert.equal(report.http.unknownOutcomes, 0);
  assert.deepEqual(harness.calls.map(call => call.url), [searchUrl, modelsUrl, completionUrl]);
  assert.deepEqual(harness.calls.map(call => call.init?.method ?? 'GET'), ['POST', 'GET', 'POST']);
  assert.ok(harness.calls.every(call => call.init?.redirect === 'error'));
  const query = JSON.parse(String(harness.calls[0].init?.body));
  assert.deepEqual(query.include_domains, ['help.shopify.com']);
  assert.equal(query.max_results, 3);
  const body = JSON.parse(String(harness.calls[2].init?.body));
  assert.equal(body.model, model); assert.equal(body.max_tokens, 1400);
  assert.deepEqual(JSON.parse(body.messages[1].content).untrusted_sources, [{ sourceId: 'S1', excerpt: source.content }]);
  for (const value of ['MG-0001', 'CLOUD-HOODIE', 'TRAIL-PACK', 'order_id', tavilyKey, nebiusKey]) assert.ok(!body.messages[1].content.includes(value));
});

test('every HTTP dispatch has a prior persisted in-flight reservation and a later response checkpoint', async () => {
  const checkpoints: IntegrationReport[] = [];
  let calls = 0;
  const harness = setup((async () => {
    const saved = checkpoints.at(-1)!;
    assert.equal(saved.http.attemptedHttpRequests, ++calls);
    assert.equal(saved.http.traces.at(-1)?.outcome, 'in-flight');
    assert.equal(saved.http.traces.at(-1)?.status, null);
    assert.ok(saved.stage.endsWith('-reserved'));
    return calls === 1 ? reply({ results: [source] }) : calls === 2 ? reply({ data: [{ id: model }] }) : reply(completion());
  }) as typeof fetch, { checkpoint: async report => { checkpoints.push(report); } });
  await harness.run();
  assert.equal(calls, 3);
  assert.deepEqual(checkpoints.map(item => item.checkpointSequence), Array.from({ length: checkpoints.length }, (_, i) => i + 1));
  for (const endpoint of ['search', 'models', 'completion']) {
    const reservation = checkpoints.find(item => item.stage === `http-${endpoint}-reserved`)!;
    const response = checkpoints.find(item => item.stage === `http-${endpoint}-response`)!;
    assert.ok(reservation.checkpointSequence < response.checkpointSequence);
    assert.equal(response.http.traces.at(-1)?.outcome, 'response');
    assert.equal(response.validatedLiveModelSuccess, false);
  }
  assert.equal(checkpoints[0].http.attemptedHttpRequests, 0);
  assert.equal(checkpoints.at(-1)?.stage, 'complete');
  // Snapshots are detached; subsequent adapter work cannot rewrite an old proof.
  assert.equal(checkpoints.find(item => item.stage === 'http-search-reserved')?.http.traces[0].outcome, 'in-flight');
});

test('missing explicit approval, provider enablement, keys or explicit NVIDIA model prevents all requests', async () => {
  const overrides: Partial<IntegrationOptions>[] = [
    { approvedLive: false }, { tavily: { enabled: false, key: tavilyKey } }, { tavily: { enabled: true } },
    { nebius: { enabled: false, key: nebiusKey, model } }, { nebius: { enabled: true, model } },
    { nebius: { enabled: true, key: nebiusKey } }, { nebius: { enabled: true, key: nebiusKey, model: 'other/vendor' } },
  ];
  for (const override of overrides) {
    const harness = setup(undefined, override);
    const result = await harness.run();
    assert.equal(result.outcome, 'not-attempted'); assert.equal(result.validatedLiveModelSuccess, false);
    assert.equal(result.http.attemptedHttpRequests, 0); assert.equal(harness.calls.length, 0);
  }
});

for (const status of [401, 429, 432, 433, 500]) test(`search HTTP ${status} consumes exactly one attempt and never calls Nebius`, async () => {
  const harness = setup((async () => reply({ error: nebiusKey }, status)) as typeof fetch);
  const result = await harness.run();
  assert.equal(harness.calls.length, 1);
  assert.equal(result.http.traces[0].status, status);
  assert.equal(result.outcome, 'search-not-validated');
  assert.equal(result.remediation, null); assert.equal(result.validatedLiveModelSuccess, false);
  assert.ok(!JSON.stringify(harness.checkpoints).includes(nebiusKey));
});

test('transport rejection remains an unknown possibly consumed request without leaked errors or retry', async () => {
  const harness = setup((async () => { throw new Error(`Arbitrary transport error ${tavilyKey}`); }) as typeof fetch);
  const result = await harness.run();
  assert.equal(harness.calls.length, 1); assert.equal(result.http.unknownOutcomes, 1);
  assert.equal(result.http.traces[0].status, null); assert.equal(result.validatedLiveModelSuccess, false);
  assert.ok(harness.checkpoints.some(item => item.stage === 'http-search-unknown'));
  const serialized = JSON.stringify(harness.checkpoints);
  assert.ok(!serialized.includes(tavilyKey)); assert.ok(!serialized.includes('Arbitrary transport error'));
});

test('unofficial sources, generic manual instructions and conflicting passages hold the model before any Nebius call', async () => {
  for (const results of [
    [{ ...source, url: 'https://untrusted.example/policy' }],
    [{ ...source, content: 'Apply a manual discount from the draft order menu and inspect discount configuration.' }],
    [source, { ...source, url: source.url + '/conflict', content: 'Manual POS discounts cannot bypass combination settings and are not an exception.' }],
  ]) {
    const harness = setup((async () => reply({ results })) as typeof fetch);
    const result = await harness.run();
    assert.equal(harness.calls.length, 1); assert.equal(result.remediation, null); assert.equal(result.validatedLiveModelSuccess, false);
    assert.ok(['search-not-validated', 'decision-held'].includes(result.outcome));
  }
});

test('only the operative supporting source reaches remediation even when it is the second result', async () => {
  const harness = setup((async (input, init) => {
    if (String(input) === searchUrl) return reply({ results: [{ ...source, url: source.url + '/draft', content: 'Load a draft order and apply a manual discount using the admin menu procedure.' }, source] });
    if (String(input) === modelsUrl) return reply({ data: [{ id: model }] });
    assert.deepEqual(JSON.parse(JSON.parse(String(init?.body)).messages[1].content).untrusted_sources, [{ sourceId: 'S2', excerpt: source.content }]);
    return reply(completion({ ...draft, documentedPolicy: [{ ...draft.documentedPolicy[0], sourceId: 'S2' }] }));
  }) as typeof fetch);
  const result = await harness.run();
  assert.deepEqual(result.decision?.sourceIds, ['S2']); assert.equal(result.validatedLiveModelSuccess, true);
});

test('missing catalogue model never substitutes another model or consumes a completion attempt', async () => {
  const harness = setup((async input => String(input) === searchUrl ? reply({ results: [source] }) : reply({ data: [{ id: 'nvidia/other-model' }] })) as typeof fetch);
  const result = await harness.run();
  assert.equal(harness.calls.length, 2); assert.equal(result.outcome, 'model-not-validated');
  assert.equal(result.remediation?.mode, 'fixture'); assert.equal(result.remediation?.proof, undefined);
  assert.equal(result.configuredModel, model); assert.equal(result.modelDiagnostic, null);
});

test('a successful completion HTTP response with invalid citations is never a validated live model success', async () => {
  const harness = setup(stages(completion({ ...draft, documentedPolicy: [{ ...draft.documentedPolicy[0], sourceId: 'S9' }] })));
  const result = await harness.run();
  assert.equal(harness.calls.length, 3); assert.equal(result.http.traces[2].status, 200);
  assert.equal(result.outcome, 'model-not-validated'); assert.equal(result.validatedLiveModelSuccess, false);
  assert.equal(result.modelDiagnostic?.validation, 'unknown-citation');
  assert.equal(result.modelDiagnostic?.schemaIssues, null);
  assert.equal(result.remediation?.proof, undefined);
  assert.ok(!JSON.stringify(result.modelDiagnostic).includes(draft.inference));
});

test('bounded completion diagnostics distinguish truncation, malformed JSON, unsupported claims and schema failure', async () => {
  const candidates = [
    { body: completion(draft, 'length'), expected: 'accepted', finish: 'length' },
    { body: completion('unparseable model text'), expected: 'invalid-json', finish: 'stop' },
    { body: completion({ ...draft, nextStep: 'Guaranteed savings of $500 in the next week.' }), expected: 'unsupported-claim', finish: 'stop' },
    { body: completion({ ...draft, unexpected: nebiusKey }), expected: 'invalid-schema', finish: 'stop' },
  ];
  for (const candidate of candidates) {
    const harness = setup(stages(candidate.body));
    const result = await harness.run();
    assert.equal(harness.calls.length, 3); assert.equal(result.validatedLiveModelSuccess, false);
    assert.equal(result.modelDiagnostic?.validation, candidate.expected);
    assert.equal(result.modelDiagnostic?.finishReason, candidate.finish);
    assert.ok(!JSON.stringify(result.modelDiagnostic).includes(nebiusKey));
    assert.ok(!JSON.stringify(result.modelDiagnostic).includes('unparseable model text'));
  }
});

test('refusal, missing content and oversized response record metadata without retaining arbitrary provider output', async () => {
  for (const body of [
    { choices: [{ finish_reason: 'stop', message: { content: null, refusal: nebiusKey, reasoning_content: 'private arbitrary provider text' } }] },
    { choices: [{ finish_reason: 'length', message: { content: 'x'.repeat(81000) } }] },
  ]) {
    const harness = setup(stages(body));
    const result = await harness.run();
    assert.equal(result.validatedLiveModelSuccess, false); assert.equal(harness.calls.length, 3);
    assert.ok(!JSON.stringify(result).includes('private arbitrary provider text'));
    assert.ok(!JSON.stringify(result).includes(nebiusKey));
  }
});

test('all checkpoint evidence redacts configured credentials including syntactically safe echoed request IDs', async () => {
  const request = (async input => String(input) === searchUrl ? reply({ results: [source] }, 200, tavilyKey) : String(input) === modelsUrl ? reply({ data: [{ id: model }] }, 200, nebiusKey) : reply(completion(), 200, nebiusKey)) as typeof fetch;
  const harness = setup(request);
  const result = await harness.run();
  assert.equal(result.validatedLiveModelSuccess, true);
  const serialized = JSON.stringify(harness.checkpoints);
  assert.ok(!serialized.includes(tavilyKey)); assert.ok(!serialized.includes(nebiusKey));
  assert.ok(result.http.traces.every(trace => trace.requestId === null));
  assert.equal(result.remediation?.proof?.requestId, null);
});

test('truncated output with no content retains actual bounded usage without claiming model success', async () => {
  const body = { choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: `private reasoning ${nebiusKey}` } }], usage: { prompt_tokens: 912, completion_tokens: 1400, total_tokens: 2312, completion_tokens_details: { reasoning_tokens: 1400, arbitrary: tavilyKey }, arbitrary: nebiusKey } };
  const harness = setup(stages(body));
  const report = await harness.run();
  assert.equal(report.http.attemptedHttpRequests, 3);
  assert.equal(report.validatedLiveModelSuccess, false);
  assert.equal(report.modelDiagnostic?.content, 'missing');
  assert.equal(report.modelDiagnostic?.finishReason, 'length');
  assert.equal(report.modelDiagnostic?.reasoningContentPresent, true);
  assert.deepEqual(report.modelDiagnostic?.usage, { promptTokens: 912, completionTokens: 1400, totalTokens: 2312, reasoningTokens: 1400 });
  const evidence = JSON.stringify(harness.checkpoints);
  for (const secret of [nebiusKey, tavilyKey, 'private reasoning', 'arbitrary']) assert.ok(!evidence.includes(secret));
});

test('invalid negative fractional oversized or nonnumeric usage fields remain null', async () => {
  for (const value of [-1, 1.5, 1000001, Number.MAX_SAFE_INTEGER, '1400', null, {}, undefined]) {
    const body = { ...completion('invalid JSON content'), usage: { prompt_tokens: value, completion_tokens: value, total_tokens: value, completion_tokens_details: { reasoning_tokens: value } } };
    const report = await setup(stages(body)).run();
    assert.equal(report.modelDiagnostic?.validation, 'invalid-json');
    assert.equal(report.validatedLiveModelSuccess, false);
    assert.deepEqual(report.modelDiagnostic?.usage, { promptTokens: null, completionTokens: null, totalTokens: null, reasoningTokens: null });
  }
});

test('zero usage is preserved while missing total and reasoning fields are never inferred', async () => {
  for (const candidate of [
    { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, completion_tokens_details: { reasoning_tokens: 0 } }, expected: { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0 } },
    { usage: { prompt_tokens: 1000000, completion_tokens: 1400 }, expected: { promptTokens: 1000000, completionTokens: 1400, totalTokens: null, reasoningTokens: null } },
  ]) {
    const report = await setup(stages({ ...completion(), usage: candidate.usage })).run();
    assert.deepEqual(report.modelDiagnostic?.usage, candidate.expected);
  }
});

test('actual requested controls are projected before dispatch and contain no request body headers or source prose', async () => {
  const checkpoints: IntegrationReport[] = [];
  const harness = setup(undefined, { checkpoint: async report => { checkpoints.push(report); } });
  const report = await harness.run();
  const payload = JSON.parse(String(harness.calls[2].init?.body));
  const controls = { max_tokens: 1400, store: typeof payload.store === 'boolean' ? payload.store : null, thinkingDisabledRequested: typeof payload.chat_template_kwargs?.enable_thinking === 'boolean' ? !payload.chat_template_kwargs.enable_thinking : null };
  assert.deepEqual(report.requestedControls, controls);
  const declared = checkpoints.find(item => item.stage === 'model-request-controls')!;
  const reservation = checkpoints.find(item => item.stage === 'http-completion-reserved')!;
  assert.deepEqual(declared.requestedControls, controls);
  assert.deepEqual(reservation.requestedControls, controls);
  assert.ok(declared.checkpointSequence < reservation.checkpointSequence);
  assert.equal(declared.http.attemptedHttpRequests, 2);
  assert.equal(checkpoints[0].requestedControls, null);
  assert.deepEqual(Object.keys(report.requestedControls!), ['max_tokens', 'store', 'thinkingDisabledRequested']);
  for (const secret of [nebiusKey, tavilyKey, source.content, 'Authorization', 'messages']) assert.ok(!JSON.stringify(report.requestedControls).includes(secret));
});

test('schema diagnostics identify original statement bounds without retaining statement prose', async () => {
  const candidates = [
    { statement: 'Manual ' + 'a'.repeat(493) + '.', code: 'too_big', maximum: 500, minimum: null, punctuation: true },
    { statement: 'Manual ' + 'a'.repeat(493) + ' as', code: 'too_big', maximum: 500, minimum: null, punctuation: false },
    { statement: 'Manual.', code: 'too_small', maximum: null, minimum: 10, punctuation: true },
  ];
  for (const candidate of candidates) {
    const body = { ...draft, documentedPolicy: [{ sourceId: 'S1', statement: candidate.statement }] };
    const report = await setup(stages(completion(body))).run();
    assert.equal(report.validatedLiveModelSuccess, false);
    assert.equal(report.modelDiagnostic?.validation, 'invalid-schema');
    assert.deepEqual(report.modelDiagnostic?.schemaIssues, [{ field: 'documentedPolicy.statement', code: candidate.code, maximum: candidate.maximum, minimum: candidate.minimum, statementCharacters: candidate.statement.length, statementWords: candidate.statement.split(/\s+/u).length, terminalPunctuationPresent: candidate.punctuation }]);
    assert.ok(!JSON.stringify(report.modelDiagnostic).includes(candidate.statement));
  }
});

test('cosmetic punctuation does not reject an otherwise valid cited policy draft', async () => {
  const statement = draft.documentedPolicy[0].statement.slice(0, -1);
  const report = await setup(stages(completion({ ...draft, documentedPolicy: [{ sourceId: 'S1', statement }] }))).run();
  assert.equal(report.validatedLiveModelSuccess, true);
  assert.equal(report.modelDiagnostic?.schemaIssues, null);
});

test('schema diagnostics allowlist field paths and preserve only numeric constraints', async () => {
  const body = { ...draft, documentedPolicy: [{ sourceId: 'unknown-id', statement: draft.documentedPolicy[0].statement }], inference: 'x', nextStep: 'x', uncertainty: 'x' };
  const report = await setup(stages(completion(body))).run();
  assert.deepEqual(report.modelDiagnostic?.schemaIssues, [
    { field: 'documentedPolicy.sourceId', code: 'too_big', maximum: 8, minimum: null, statementCharacters: null, statementWords: null, terminalPunctuationPresent: null },
    ...(['inference', 'nextStep', 'uncertainty'] as const).map(field => ({ field, code: 'too_small', maximum: null, minimum: field === 'uncertainty' ? 20 : 10, statementCharacters: null, statementWords: null, terminalPunctuationPresent: null })),
  ]);
  assert.equal(report.validatedLiveModelSuccess, false);
});

test('schema diagnostics omit arbitrary keys messages raw values and configured secrets', async () => {
  const raw = { ...draft, documentedPolicy: [{ sourceId: { [tavilyKey]: nebiusKey }, statement: { [nebiusKey]: 'private statement prose' }, [tavilyKey]: 'private extra value' }], nextStep: null, uncertainty: [], [nebiusKey]: 'private root value' };
  const report = await setup(stages(completion(raw))).run();
  const issues = report.modelDiagnostic?.schemaIssues;
  assert.ok(issues && issues.length > 0 && issues.length <= 8);
  assert.ok(issues.some(issue => issue.field === 'root' && issue.code === 'unrecognized_keys'));
  assert.ok(issues.some(issue => issue.field === 'documentedPolicy.statement' && issue.code === 'invalid_type'));
  assert.ok(issues.every(issue => issue.statementCharacters === null && issue.statementWords === null && issue.terminalPunctuationPresent === null));
  const projected = JSON.stringify(report.modelDiagnostic);
  for (const secret of [tavilyKey, nebiusKey, 'private statement prose', 'private extra value', 'private root value', 'message', 'expected', 'received']) assert.ok(!projected.includes(secret));
  assert.equal(report.validatedLiveModelSuccess, false);
});

test('schema diagnostic list is capped at eight issues and absent statements remain null', async () => {
  const body = { ...draft, documentedPolicy: Array.from({ length: 3 }, () => ({ sourceId: 'unknown-id' })), inference: null, nextStep: null, uncertainty: null };
  const report = await setup(stages(completion(body))).run();
  const issues = report.modelDiagnostic?.schemaIssues;
  assert.equal(issues?.length, 8);
  assert.ok(issues?.every(issue => issue.statementCharacters === null && issue.statementWords === null && issue.terminalPunctuationPresent === null));
  assert.equal(report.validatedLiveModelSuccess, false);
});

test('failed checkpoint persistence stops before dispatch and prevents all subsequent real attempts', async () => {
  let transportCalls = 0;
  const harness = setup((async () => { transportCalls++; return reply({ results: [source] }); }) as typeof fetch, {
    checkpoint: async report => { if (report.stage === 'http-search-reserved') throw new Error(`private disk failure ${nebiusKey}`); },
  });
  await assert.rejects(harness.run(), { message: 'Integration checkpoint persistence failed' });
  assert.equal(transportCalls, 0);
});
