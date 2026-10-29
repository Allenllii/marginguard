import { ZodError } from 'zod';
import { analyze } from '../../server/analysis.js';
import { createDemoCsv } from '../../server/demo.js';
import { remediate, validateRemediation } from '../../server/nebius.js';
import { research, type TavilyConfig } from '../../server/tavily.js';
import { decidePolicy } from '../../shared/policy-decision.js';
import type { PolicyDecision, Remediation, ResearchPacket } from '../../shared/types.js';
import { createRequestMeter, serializeEvaluationEvidence } from './request-meter.js';

// Operator integration check only. Importing this module reads no environment,
// opens no files, and makes no requests. A caller must supply every side effect.
export const INTEGRATION_HTTP_LIMIT = 3;
const context = { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' } as const;
const route = [
  { url: 'https://api.tavily.com/search', method: 'POST', name: 'search' },
  { url: 'https://api.tokenfactory.nebius.com/v1/models', method: 'GET', name: 'models' },
  { url: 'https://api.tokenfactory.nebius.com/v1/chat/completions', method: 'POST', name: 'completion' },
] as const;
type NebiusConfig = Parameters<typeof remediate>[3];
type HttpEvidence = ReturnType<ReturnType<typeof createRequestMeter>['snapshot']>;
type Outcome = 'running' | 'not-attempted' | 'search-not-validated' | 'decision-held' | 'model-not-validated' | 'validated-live-model';
type RequestedControls = { max_tokens: number | null; store: boolean | null; thinkingDisabledRequested: boolean | null };
const schemaIssueCodes = ['invalid_type', 'too_big', 'too_small', 'invalid_format', 'not_multiple_of', 'unrecognized_keys', 'invalid_union', 'invalid_key', 'invalid_element', 'invalid_value', 'custom'] as const;
type SchemaIssueDiagnostic = {
  field: 'documentedPolicy.statement' | 'documentedPolicy.sourceId' | 'inference' | 'nextStep' | 'uncertainty' | 'root';
  code: typeof schemaIssueCodes[number] | 'other';
  maximum: number | null;
  minimum: number | null;
  statementCharacters: number | null;
  statementWords: number | null;
  terminalPunctuationPresent: boolean | null;
};
export type ModelDiagnostic = {
  body: 'parsed-json' | 'invalid-json-or-oversized';
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | 'other' | 'missing';
  refusalPresent: boolean;
  reasoningContentPresent: boolean;
  content: 'missing' | 'non-string' | 'empty' | 'present' | 'too-long';
  contentCharacters: number | null;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null; reasoningTokens: number | null };
  schemaIssues: SchemaIssueDiagnostic[] | null;
  validation: 'not-evaluated' | 'invalid-json' | 'unknown-citation' | 'unsupported-claim' | 'unsupported-policy-scope' | 'incomplete-or-copied-prose' | 'observed-agreement-error' | 'invalid-schema' | 'accepted';
};
export type IntegrationReport = {
  schemaVersion: 1;
  scope: 'OPERATOR_INTEGRATION_CHECK_NOT_FINAL_BENCHMARK';
  runId: string;
  stage: string;
  checkpointSequence: number;
  outcome: Outcome;
  validatedLiveModelSuccess: boolean;
  configuredModel: string | null;
  fixture: { caseId: 'shopify-us-manual-discount'; synthetic: true; context: typeof context; datasetFingerprint: string; issueKind: 'discount'; exposureCents: number; affectedRows: number };
  http: HttpEvidence;
  rejectedUnexpectedRequests: number;
  packet: ResearchPacket | null;
  decision: PolicyDecision | null;
  remediation: Remediation | null;
  requestedControls: RequestedControls | null;
  modelDiagnostic: ModelDiagnostic | null;
  humanPolicyFidelityReview: 'pending';
  limitations: string;
};
export type IntegrationOptions = {
  runId: string;
  approvedLive: boolean;
  tavily: TavilyConfig;
  nebius: NebiusConfig;
  request: typeof fetch;
  checkpoint: (report: IntegrationReport) => Promise<void>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// Numbers outside this diagnostic-only bound remain unknown. Never derive a
// missing total/reasoning count or coerce strings into reported provider usage.
function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : null;
}

function schemaIssues(error: ZodError, parsed: unknown): SchemaIssueDiagnostic[] {
  const policy = object(parsed)?.documentedPolicy;
  return error.issues.slice(0, 8).map(issue => {
    const path = issue.path;
    let field: SchemaIssueDiagnostic['field'] = 'root';
    let statement: unknown;
    if (path.length === 3 && path[0] === 'documentedPolicy' && typeof path[1] === 'number' && Number.isInteger(path[1]) && path[1] >= 0) {
      if (path[2] === 'statement') {
        field = 'documentedPolicy.statement';
        statement = object(Array.isArray(policy) ? policy[path[1]] : null)?.statement;
      } else if (path[2] === 'sourceId') field = 'documentedPolicy.sourceId';
    } else if (path.length === 1 && (path[0] === 'inference' || path[0] === 'nextStep' || path[0] === 'uncertainty')) field = path[0];
    const details = object(issue);
    return {
      field, code: schemaIssueCodes.includes(issue.code) ? issue.code : 'other', maximum: tokenCount(details?.maximum), minimum: tokenCount(details?.minimum),
      statementCharacters: typeof statement === 'string' ? Math.min(statement.length, 15000) : null,
      statementWords: typeof statement === 'string' ? statement.trim() ? Math.min(statement.trim().split(/\s+/u).length, 15000) : 0 : null,
      terminalPunctuationPresent: typeof statement === 'string' ? /[.!?]["'’”»]*\s*$/u.test(statement) : null,
    };
  });
}

function requestedControls(body: RequestInit['body']): RequestedControls {
  let payload: Record<string, unknown> | null = null;
  try {
    if (typeof body === 'string' && new TextEncoder().encode(body).byteLength <= 16000) payload = object(JSON.parse(body));
  } catch { /* Invalid or unavailable request controls remain unknown. */ }
  const maxTokens = tokenCount(payload?.max_tokens);
  const thinking = object(payload?.chat_template_kwargs)?.enable_thinking;
  return { max_tokens: maxTokens !== null && maxTokens > 0 ? maxTokens : null, store: typeof payload?.store === 'boolean' ? payload.store : null, thinkingDisabledRequested: typeof thinking === 'boolean' ? !thinking : null };
}

async function diagnosticJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Missing diagnostic body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 80000) throw new Error('Diagnostic byte limit exceeded');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } catch {
    // A clone is a tee branch: awaiting its cancellation before the adapter
    // consumes the original would deadlock an oversized response. Cancel this
    // branch now and let the adapter independently consume/enforce its own cap.
    void reader.cancel().catch(() => {});
    throw new Error('Invalid diagnostic body');
  } finally { reader.releaseLock(); }
}

// Inspect a bounded response clone, retaining fixed enums/counts only. Never save
// model prose, reasoning, arbitrary provider errors, response headers or bodies.
export async function diagnosePolicyResponse(response: Response, supported: ResearchPacket): Promise<ModelDiagnostic> {
  const result: ModelDiagnostic = { body: 'invalid-json-or-oversized', finishReason: 'missing', refusalPresent: false, reasoningContentPresent: false, content: 'missing', contentCharacters: null, usage: { promptTokens: null, completionTokens: null, totalTokens: null, reasoningTokens: null }, schemaIssues: null, validation: 'not-evaluated' };
  let raw: Record<string, unknown> | null;
  try { raw = object(await diagnosticJson(response)); result.body = 'parsed-json'; } catch { return result; }
  const usage = object(raw?.usage);
  result.usage = { promptTokens: tokenCount(usage?.prompt_tokens), completionTokens: tokenCount(usage?.completion_tokens), totalTokens: tokenCount(usage?.total_tokens), reasoningTokens: tokenCount(object(usage?.completion_tokens_details)?.reasoning_tokens) };
  const choice = object(Array.isArray(raw?.choices) ? raw.choices[0] : null);
  const message = object(choice?.message);
  const finish = choice?.finish_reason;
  result.finishReason = finish === undefined || finish === null ? 'missing' : ['stop', 'length', 'content_filter', 'tool_calls'].includes(String(finish)) ? finish as ModelDiagnostic['finishReason'] : 'other';
  result.refusalPresent = Boolean(message?.refusal);
  result.reasoningContentPresent = Boolean(message?.reasoning_content);
  const content = message?.content;
  result.content = content === undefined || content === null ? 'missing' : typeof content !== 'string' ? 'non-string' : content.length === 0 ? 'empty' : content.length > 15000 ? 'too-long' : 'present';
  result.contentCharacters = typeof content === 'string' ? Math.min(content.length, 80000) : null;
  if (result.content !== 'present') return result;
  let parsed: unknown;
  try { parsed = JSON.parse(content as string); } catch { result.validation = 'invalid-json'; return result; }
  try { validateRemediation(parsed, supported); result.validation = 'accepted'; }
  catch (error) {
    if (error instanceof ZodError) result.schemaIssues = schemaIssues(error, parsed);
    // Only classify known validator literals; never export error.message itself.
    result.validation = error instanceof Error && error.message === 'Unknown citation' ? 'unknown-citation' : error instanceof Error && error.message === 'Unsupported claim' ? 'unsupported-claim' : error instanceof Error && error.message === 'Unsupported policy statement' ? 'unsupported-policy-scope' : error instanceof Error && error.message === 'Incomplete or copied policy prose' ? 'incomplete-or-copied-prose' : error instanceof Error && error.message === 'Observed policy prose agreement error' ? 'observed-agreement-error' : 'invalid-schema';
  }
  return result;
}

export async function verifyPolicyIntegration(options: IntegrationOptions): Promise<IntegrationReport> {
  const analysis = analyze(createDemoCsv(), 'Synthetic operator integration fixture', true);
  const issue = analysis.issues.find(item => item.kind === 'discount');
  if (!issue) throw new Error('Synthetic integration fixture lacks its discount finding');
  let persistenceFailed = false;
  let supported: ResearchPacket | null = null;
  const credentials = [options.tavily.key, options.nebius?.key].filter((key): key is string => Boolean(key));
  const snapshot = (): IntegrationReport => JSON.parse(serializeEvaluationEvidence(JSON.parse(JSON.stringify({ ...report, http: meter.snapshot() }, (_key, value) => typeof value === 'string' ? credentials.reduce((text, credential) => text.replaceAll(credential, '[REDACTED]'), value) : value))));
  const checkpoint = async (stage: string) => {
    if (persistenceFailed) throw new Error('Integration checkpoint persistence failed');
    report.stage = stage; report.checkpointSequence++;
    try { await options.checkpoint(snapshot()); }
    catch { persistenceFailed = true; throw new Error('Integration checkpoint persistence failed'); }
  };
  const meter = createRequestMeter(INTEGRATION_HTTP_LIMIT, (async (input, init) => {
    const trace = meter.snapshot().traces.at(-1)!;
    // The meter has reserved this attempt. Persist the in-flight reservation
    // before dispatch so interruption cannot silently erase a possibly used call.
    await checkpoint(`http-${trace.endpoint}-reserved`);
    return options.request(input, init);
  }) as typeof fetch);
  const report: IntegrationReport = {
    schemaVersion: 1, scope: 'OPERATOR_INTEGRATION_CHECK_NOT_FINAL_BENCHMARK', runId: options.runId, stage: 'prepared', checkpointSequence: 0,
    outcome: 'running', validatedLiveModelSuccess: false, configuredModel: options.nebius?.model ?? null,
    fixture: { caseId: 'shopify-us-manual-discount', synthetic: true, context, datasetFingerprint: analysis.fingerprint, issueKind: 'discount', exposureCents: issue.exposure, affectedRows: issue.rowIds.length },
    http: meter.snapshot(), rejectedUnexpectedRequests: 0, packet: null, decision: null, remediation: null, requestedControls: null, modelDiagnostic: null, humanPolicyFidelityReview: 'pending',
    limitations: 'One fixed synthetic integration case. HTTP responses do not establish valid live model output. Accepted output passes schema, citation and prohibited-claim checks; semantic policy support and applicability require human review. No benchmark score, eligibility, causal impact or savings claim. Reservations are persisted before transport; interrupted in-flight attempts have uncertain provider usage. No retries, alternate model, or alternate provider.',
  };
  await checkpoint('prepared');
  if (!options.approvedLive || !options.tavily.enabled || !options.tavily.key || !options.nebius?.enabled || !options.nebius.key || !options.nebius.model || options.nebius.model.length > 512 || !/^nvidia\/[a-zA-Z0-9._/-]+$/i.test(options.nebius.model)) {
    report.outcome = 'not-attempted'; await checkpoint('preflight-blocked'); return snapshot();
  }
  const request: typeof fetch = async (input, init) => {
    const expected = route[meter.snapshot().attemptedHttpRequests];
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!expected || url !== expected.url || method !== expected.method) {
      report.rejectedUnexpectedRequests++; await checkpoint('unexpected-request-blocked');
      throw new Error('Integration request sequence blocked');
    }
    if (expected.name === 'completion') {
      report.requestedControls = requestedControls(init?.body);
      await checkpoint('model-request-controls');
    }
    let response: Response;
    try { response = await meter.request(input, init); }
    catch { await checkpoint(`http-${expected.name}-unknown`); throw new Error('Integration transport did not establish a response'); }
    await checkpoint(`http-${expected.name}-response`);
    if (expected.name === 'completion' && supported) {
      report.modelDiagnostic = await diagnosePolicyResponse(response.clone(), supported);
      await checkpoint('model-response-diagnosed');
    }
    return response;
  };
  await checkpoint('search-started');
  const packet: ResearchPacket = { ...await research('discount', context, true, options.tavily, request), researchId: options.runId };
  report.packet = packet;
  await checkpoint('search-validated');
  if (packet.mode !== 'live' || packet.status !== 'ok' || !packet.proof || !packet.sources.length) {
    report.outcome = 'search-not-validated'; await checkpoint('complete'); return snapshot();
  }
  const decision = decidePolicy('discount', packet);
  report.decision = decision;
  await checkpoint('decision-checked');
  // This exact manual-discount case needs a supporting exception passage. A
  // generic search result or merely successful HTTP status cannot unlock Nebius.
  if (decision.status !== 'contradicted' || !decision.sourceIds.length) {
    report.outcome = 'decision-held'; await checkpoint('complete'); return snapshot();
  }
  supported = { ...packet, sources: packet.sources.filter(source => decision.sourceIds.includes(source.id)) };
  await checkpoint('model-started');
  report.remediation = await remediate(issue, packet, true, options.nebius, request);
  report.validatedLiveModelSuccess = report.remediation.mode === 'live' && Boolean(report.remediation.proof) && meter.snapshot().attemptedHttpRequests === INTEGRATION_HTTP_LIMIT;
  report.outcome = report.validatedLiveModelSuccess ? 'validated-live-model' : 'model-not-validated';
  await checkpoint('model-validated');
  await checkpoint('complete');
  return snapshot();
}
