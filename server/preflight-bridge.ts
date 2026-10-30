import type { LiveService } from './budget.js';
import { retrievePreflightPolicy, type PreflightPolicyResult } from './preflight-policy.js';
import { normalizePreflightActivity, parsePreflightIntent } from './preflight-intent.js';
import type { PreflightRule } from '../shared/preflight.js';

type Endpoint = 'search' | 'extract' | 'models' | 'completion';
export interface PreflightHttpTrace {
  endpoint: Endpoint; provider: LiveService; outcome: 'in-flight' | 'response' | 'unknown'; status: number | null;
}
export interface PreflightHttpReport {
  maximumAttempts: 4; attempted: number; blocked: boolean; unknownOutcomes: number; traces: PreflightHttpTrace[];
}
export interface PreflightBridgeResult {
  mode: 'fixture' | 'live'; status: 'HOLD' | 'NEEDS_CONFIRMATION'; reason: string;
  rules: PreflightRule[]; policy: PreflightPolicyResult | null; model: string | null;
  requiresSellerConfirmation: true; applyAutomatically: false; checkoutVerified: false;
  http: PreflightHttpReport;
}
export interface PreflightBridgeOptions {
  live: boolean;
  tavily: { enabled?: boolean; key?: string };
  nebius: { enabled?: boolean; key?: string; model?: string };
  /** Existing service guard: durable/public caps, expiry and provider attempt budget. */
  reserve: (service: LiveService) => Promise<boolean>;
  request: typeof fetch;
  now?: () => number;
  /** Trusted test-fixture review dependency; never supplied by HTTP or env. */
  reviewPreflightSource?: (text: string) => boolean;
  onRateLimit?: (service: LiveService, retryAfterSeconds: number) => void;
}

/** One fixed pipeline, at most four physical attempts; no retries or raw-data logging. */
export async function preparePreflightBridge(activity: unknown, options: PreflightBridgeOptions): Promise<PreflightBridgeResult> {
  const traces: PreflightHttpTrace[] = [];
  let blocked = false;
  const snapshot = (): PreflightHttpReport => ({ maximumAttempts: 4, attempted: traces.length, blocked, unknownOutcomes: traces.filter(trace => trace.outcome === 'unknown').length, traces: traces.map(trace => ({ ...trace })) });
  const result = (reason: string, extra: Partial<PreflightBridgeResult> = {}): PreflightBridgeResult => ({
    mode: traces.length ? 'live' : 'fixture', status: 'HOLD', reason, rules: [], policy: null, model: null,
    requiresSellerConfirmation: true, applyAutomatically: false, checkoutVerified: false, ...extra, http: snapshot(),
  });
  // Validate the privacy grammar before spending even a Search attempt.
  let normalized: ReturnType<typeof normalizePreflightActivity>;
  try { normalized = normalizePreflightActivity(activity); }
  catch { return result('Unsupported activity. Use the documented campaign grammar without customer data.'); }
  if (!options.live) return result('Offline fixture mode. No provider was called and no campaign has been parsed.');
  if (!options.tavily.enabled || !options.tavily.key || !options.nebius.enabled || !options.nebius.key || !options.nebius.model || !/^nvidia\/[a-zA-Z0-9._/-]+$/u.test(options.nebius.model)) return result('An explicitly enabled Tavily and NVIDIA/Nebius configuration is required. No provider was called.');

  const request: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const endpoint: Endpoint | null = url === 'https://api.tavily.com/search' && method === 'POST' ? 'search'
      : url === 'https://api.tavily.com/extract' && method === 'POST' ? 'extract'
        : url === 'https://api.tokenfactory.nebius.com/v1/models' && method === 'GET' ? 'models'
          : url === 'https://api.tokenfactory.nebius.com/v1/chat/completions' && method === 'POST' ? 'completion' : null;
    if (!endpoint || traces.length >= 4) { blocked = true; throw new Error('Preflight transport boundary'); }
    const provider = endpoint === 'search' || endpoint === 'extract' ? 'tavily' : 'nebius';
    // The pipeline is sequential; reserve immediately before every physical request.
    let allowed: boolean;
    try { allowed = await options.reserve(provider); }
    catch { blocked = true; throw new Error('Preflight budget unavailable'); }
    if (!allowed) { blocked = true; throw new Error('Preflight budget denied'); }
    const trace: PreflightHttpTrace = { endpoint, provider, outcome: 'in-flight', status: null };
    traces.push(trace);
    try {
      const response = await options.request(input, { ...init, redirect: 'error' });
      trace.outcome = 'response'; trace.status = response.status;
      if (response.status === 429) {
        const header = response.headers.get('retry-after');
        // RFC 9110 allows both delta-seconds and HTTP-date. Do not shorten an
        // upstream wait to an hour; a later explicit request must respect it too.
        const dated = header && /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/u.test(header) ? Date.parse(header) : NaN;
        const seconds = header && /^\d{1,10}$/u.test(header) ? Math.max(1, Number(header))
          : Number.isFinite(dated) ? Math.max(1, Math.ceil((dated - (options.now ?? Date.now)()) / 1000)) : 60;
        options.onRateLimit?.(provider, seconds);
      }
      return response;
    } catch { trace.outcome = 'unknown'; throw new Error('Preflight upstream outcome unknown'); }
  };
  let contentRejected = false;
  const policy = await retrievePreflightPolicy(options.tavily, request, text => {
    contentRejected = [options.tavily.key, options.nebius.key].some(key => !!key && text.includes(key));
    return contentRejected;
  }, options.reviewPreflightSource);
  if (contentRejected || [options.tavily.key, options.nebius.key].some(key => key && JSON.stringify(policy).includes(key))) return result('The policy response failed the data safety check. No proposal or response content is exposed.');
  if (policy.mode !== 'live' || policy.status !== 'REFERENCE_READY') return result(blocked ? 'The request budget or guard stopped the pipeline. No automatic retry was made.' : policy.reason, { policy });
  const intent = await parsePreflightIntent(normalized, options.nebius, request);
  if (blocked || intent.mode !== 'live' || intent.status !== 'NEEDS_CONFIRMATION') return result(blocked ? 'The request budget or guard stopped the pipeline. No automatic retry was made.' : intent.reason, { policy });
  return result('Review the exact parsed rules and explicitly confirm seller inputs before running the bounded simulation.', { status: 'NEEDS_CONFIRMATION', rules: intent.rules, policy, model: intent.model });
}
