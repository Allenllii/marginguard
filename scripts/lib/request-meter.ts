// Evaluation-only transport. Not imported by the public app or provider adapters.
export type RequestTrace = {
  sequence: number;
  provider: 'nebius' | 'tavily';
  endpoint: 'models' | 'completion' | 'search';
  method: string;
  startedAt: string;
  outcome: 'in-flight' | 'response' | 'unknown';
  status: number | null;
  requestId: string | null;
  responseLatencyMs: number | null;
};

export class RequestBudgetExhausted extends Error {
  constructor() { super('Approved evaluation HTTP request budget exhausted'); }
}

export function sanitizeRequestId(value: unknown): string | null {
  return typeof value === 'string' && /^[\w.-]{1,128}$/.test(value) ? value : null;
}

// Adapter proofs can carry IDs from response headers or JSON, independently of
// the meter's trace. Apply the same constraint to every exported request ID.
export function serializeEvaluationEvidence(value: unknown): string {
  return JSON.stringify(value, (key, item) => key === 'requestId' ? sanitizeRequestId(item) : item, 2) + '\n';
}

export function createRequestMeter(maximum: number, transport: typeof fetch = fetch) {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 60) throw new Error('HTTP request limit must be an integer from 1 to 60');
  const traces: RequestTrace[] = [];
  let blockedAttempts = 0;
  const request: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const endpoint = url.href === 'https://api.tokenfactory.nebius.com/v1/models' && method === 'GET' ? 'models'
      : url.href === 'https://api.tokenfactory.nebius.com/v1/chat/completions' && method === 'POST' ? 'completion'
        : url.href === 'https://api.tavily.com/search' && method === 'POST' ? 'search' : null;
    if (!endpoint) throw new Error('Evaluation transport permits only the fixed provider endpoints and methods');
    // Reserve synchronously before awaiting transport; concurrent operations share one cap.
    if (traces.length >= maximum) { blockedAttempts++; throw new RequestBudgetExhausted(); }
    const trace: RequestTrace = { sequence: traces.length + 1, provider: endpoint === 'search' ? 'tavily' : 'nebius', endpoint, method, startedAt: new Date().toISOString(), outcome: 'in-flight', status: null, requestId: null, responseLatencyMs: null };
    traces.push(trace);
    const start = performance.now();
    try {
      const response = await transport(input, { ...init, redirect: 'error' });
      const requestId = response.headers.get('x-request-id');
      trace.outcome = 'response'; trace.status = response.status;
      trace.requestId = sanitizeRequestId(requestId);
      return response;
    } catch (error) {
      // A rejected fetch does not establish whether the provider received/charged it.
      // Never persist arbitrary error strings, headers, bodies or credentials.
      trace.outcome = 'unknown';
      throw error;
    } finally { trace.responseLatencyMs = Math.round(performance.now() - start); }
  };
  return {
    request,
    remaining: () => maximum - traces.length,
    snapshot: () => ({ maximumApprovedHttpRequests: maximum, attemptedHttpRequests: traces.length, blockedAttempts, unknownOutcomes: traces.filter(t => t.outcome === 'unknown').length, traces: traces.map(t => ({ ...t })), latencyDefinition: 'Per HTTP attempt to response headers or rejection; excludes response-body consumption. Logical adapter proof includes validation and is reported separately.', usageNote: 'HTTP response status does not establish valid model output or policy fidelity. Unknown fetch outcomes can still consume provider usage.' }),
  };
}
