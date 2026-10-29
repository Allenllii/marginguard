// Evaluation-only transport. Provider payloads never enter the durable ledger.
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { canonicalHash } from './ledger.mjs';

const ENDPOINTS = Object.freeze({
  model: 'https://api.tokenfactory.nebius.com/v1/chat/completions',
  search: 'https://api.tavily.com/search',
});
const MAX_RESPONSE_BYTES = 200000;
const MAX_REQUEST_BYTES = 100000;

export class EvaluationTransportError extends Error {
  constructor(code, outcome) {
    super(`Evaluation request stopped: ${code}`);
    this.name = 'EvaluationTransportError';
    this.code = code;
    this.outcome = outcome;
  }
}

function providerRequestId(value, apiKey) {
  return typeof value === 'string' && !value.includes(apiKey) && /^[A-Za-z0-9][\w.-]{0,127}$/.test(value) && !/^(?:sk-|tvly-|Bearer|eyJ)/i.test(value) ? value : null;
}

function containsCredential(value, apiKey) {
  if (typeof value === 'string') return value.includes(apiKey);
  if (Array.isArray(value)) return value.some(item => containsCredential(item, apiKey));
  if (value && typeof value === 'object') return Object.entries(value).some(([key, item]) => key.includes(apiKey) || containsCredential(item, apiKey));
  return false;
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function usageFrom(raw, provider) {
  if (!raw || typeof raw !== 'object' || !raw.usage || typeof raw.usage !== 'object') return null;
  if (provider === 'search') {
    const credits = raw.usage.credits;
    return typeof credits === 'number' && Number.isFinite(credits) && credits >= 0 && credits <= Number.MAX_SAFE_INTEGER ? { credits } : null;
  }
  const inputTokens = count(raw.usage.prompt_tokens);
  const outputTokens = count(raw.usage.completion_tokens);
  const totalTokens = count(raw.usage.total_tokens);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  if (inputTokens !== null && outputTokens !== null && totalTokens !== null && inputTokens + outputTokens !== totalTokens) return null;
  return { inputTokens, outputTokens, totalTokens };
}

async function boundedBody(response) {
  const length = response.headers.get('content-length');
  if (length !== null && /^\d+$/.test(length) && Number(length) > MAX_RESPONSE_BYTES) {
    try { await response.body?.cancel(); } catch { /* No body or error text is persisted. */ }
    throw new EvaluationTransportError('response-too-large', 'failed');
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch { /* Keep the bounded failure classification. */ }
        throw new EvaluationTransportError('response-too-large', 'failed');
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof EvaluationTransportError) throw error;
    throw new EvaluationTransportError('response-body-unknown', 'unknown');
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

/** One reservation, one HTTP dispatch, and one durable terminal event; never retries. */
export async function performRequest({ ledger, requestId, caseId, arm, stage, provider, body, reserveMicros, apiKey, transport = globalThis.fetch, signal, validate }) {
  const endpoint = ENDPOINTS[provider];
  if (!endpoint || typeof transport !== 'function' || typeof validate !== 'function' || typeof apiKey !== 'string' || !apiKey || /[\r\n]/.test(apiKey)) throw new EvaluationTransportError('invalid-configuration', 'not-dispatched');
  if (signal?.aborted) throw new EvaluationTransportError('aborted-before-dispatch', 'not-dispatched');
  let serialized, requestHash;
  try {
    requestHash = canonicalHash({ endpoint, body });
    serialized = JSON.stringify(body);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_REQUEST_BYTES) throw new Error();
  } catch { throw new EvaluationTransportError('invalid-request-body', 'not-dispatched'); }
  // reserve() fsyncs the write-ahead record; no awaited operation precedes dispatch.
  ledger.reserve({ requestId, caseId, arm, stage, provider, requestHash, reserveMicros });
  const timeout = globalThis.AbortSignal.timeout(provider === 'model' ? 45000 : 20000);
  const requestSignal = signal ? globalThis.AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await transport(endpoint, {
      method: 'POST', redirect: 'error', signal: requestSignal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: serialized,
    });
  } catch {
    ledger.unknown(requestId);
    throw new EvaluationTransportError('http-outcome-unknown', 'unknown');
  }
  // Only a standard Response (including an injected offline Response) is accepted.
  if (!(response instanceof globalThis.Response)) {
    ledger.unknown(requestId);
    throw new EvaluationTransportError('invalid-transport-response', 'unknown');
  }
  const metadata = {
    httpStatus: response.status >= 100 && response.status <= 599 ? response.status : null,
    providerRequestId: providerRequestId(response.headers.get('x-request-id'), apiKey),
    actualCostMicros: null, responseHash: null, validatedOutputHash: null, usage: null,
  };
  let bytes;
  try { bytes = await boundedBody(response); } catch (error) {
    const outcome = error instanceof EvaluationTransportError ? error.outcome : 'unknown';
    if (outcome === 'failed') ledger.fail(requestId, metadata);
    else ledger.unknown(requestId, metadata);
    throw new EvaluationTransportError(outcome === 'failed' ? 'response-too-large' : 'response-body-unknown', outcome);
  }
  metadata.responseHash = createHash('sha256').update(bytes).digest('hex');
  let raw;
  try { raw = JSON.parse(new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch {
    ledger.fail(requestId, metadata);
    throw new EvaluationTransportError('invalid-json-response', 'failed');
  }
  metadata.usage = usageFrom(raw, provider);
  if (!metadata.providerRequestId) metadata.providerRequestId = providerRequestId(provider === 'model' ? raw?.id : raw?.request_id, apiKey);
  if (!response.ok) {
    ledger.fail(requestId, metadata);
    throw new EvaluationTransportError('http-error-response', 'failed');
  }
  let value;
  try {
    value = await validate(raw);
    const validatedOutputHash = canonicalHash(value);
    if (containsCredential(value, apiKey)) throw new Error();
    metadata.validatedOutputHash = validatedOutputHash;
  } catch {
    ledger.fail(requestId, metadata);
    throw new EvaluationTransportError('invalid-output-schema', 'failed');
  }
  // If this durable write fails, the outstanding reservation remains unretryable.
  ledger.complete(requestId, metadata);
  return { value, usage: metadata.usage, responseHash: metadata.responseHash };
}
