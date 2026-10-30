import { z } from 'zod';
import { analyze, InputError, MAX_BYTES } from './analysis.js';
import { createDemoCsv } from './demo.js';
import { explain, providerStatus, remediate } from './nebius.js';
import { ContextSchema, KindSchema, research, tavilyStatus } from './tavily.js';
import { decidePolicy } from '../shared/policy-decision.js';
import { budgetLimits, MemoryBudget, type LiveBudget, type LiveService } from './budget.js';
import type { ResearchPacket } from '../shared/types.js';
import { fixtureReference, parseFixtureReference, ResearchIdSchema } from './fixture-reference.js';
import { preparePreflightBridge } from './preflight-bridge.js';
import { DEFAULT_REASONING_MODEL } from './preflight-intent.js';
import { PreflightValidationError, runPreflight, validatePreflightInput, type PreflightRule } from '../shared/preflight.js';
import { CHECK_FIX_EXAMPLES, CheckFixRequestSchema, checkFixLive, checkFixOffline, screenCheckFix } from './check-fix.js';

export const AssumptionsSchema = z.object({ discountCeilingPercent: z.number().int().min(0).max(60), shippingSubsidyCents: z.number().int().min(0).max(2000) }).strict();
const Payload = z.object({ csv: z.string().min(1).max(MAX_BYTES), live: z.boolean().optional(), assumptions: AssumptionsSchema.optional() }).strict();
export interface Reply { status: number; body: unknown; headers?: Record<string, string>; }
export interface ResearchStore { get(id: string): Promise<ResearchPacket | null>; put(packet: ResearchPacket): Promise<void>; }
export class MemoryResearchStore implements ResearchStore {
  private records = new Map<string, { packet: ResearchPacket; expires: number }>();
  async get(id: string) { const r = this.records.get(id); return r && r.expires > Date.now() ? r.packet : null; }
  async put(packet: ResearchPacket) { for (const [id, r] of this.records) if (r.expires < Date.now()) this.records.delete(id); if (this.records.size >= 50) this.records.delete(this.records.keys().next().value!); this.records.set(packet.researchId, { packet, expires: Date.now() + 600000 }); }
}
export function createService(options: { env?: Record<string, string | undefined>; budget?: LiveBudget; store?: ResearchStore; request?: typeof fetch; reviewPreflightSource?: (text: string) => boolean; now?: () => number } = {}) {
  const env = options.env ?? {}, now = options.now ?? Date.now, request = options.request ?? fetch;
  const limits = budgetLimits(env), budget = options.budget ?? new MemoryBudget(limits), store = options.store ?? new MemoryResearchStore();
  // Routing: NEBIUS_MODEL serves fast drafts (explain/remediate); NEBIUS_REASONING_MODEL interprets campaigns.
  const nvidia = { key: env.NEBIUS_API_KEY, model: env.NEBIUS_MODEL || 'nvidia/Nemotron-3_5-Lightning', reasoningModel: env.NEBIUS_REASONING_MODEL || DEFAULT_REASONING_MODEL, enabled: env.NEBIUS_ENABLE_LIVE === 'true' };
  const tavily = { key: env.TAVILY_API_KEY, enabled: env.TAVILY_ENABLE_LIVE === 'true' };
  const hosted = env.PUBLIC_DEMO === 'true', liveSafe = !hosted || (budget.durable && env.PROVIDER_HARD_CAPS_VERIFIED === 'true');
  const expires = Date.parse(env.LIVE_ENABLED_UNTIL || '2026-12-16T00:00:00Z');
  if (!Number.isFinite(expires)) throw new Error('LIVE_ENABLED_UNTIL must be an ISO date.');
  // Offline QA runs the whole browser suite against one process; production keeps 120/min.
  const apiMinuteLimit = env.QA_API_MINUTE_LIMIT === '2000' && env.TAVILY_ENABLE_LIVE === 'false' && env.NEBIUS_ENABLE_LIVE === 'false' ? 2000 : 120;
  let modelInFlight = false, searchInFlight = false, nextModel = 0, nextSearch = 0, apiMinute = -1, apiCount = 0;
  // Ephemeral proposals hold generated rules, never seller data. Restarts expire safely.
  const proposals = new Map<string, { rules: PreflightRule[]; expires: number }>();
  async function reserve(service: LiveService | readonly LiveService[]): Promise<Reply | null> {
    if (!liveSafe) return { status: 503, body: { error: 'Public live calls require a durable budget store and verified provider hard caps. Offline demo remains available.' } };
    if (now() >= expires) return { status: 503, body: { error: 'This live-demo authorization window has ended. Offline analysis remains available.' } };
    const result = await budget.reserve(service, now());
    return result.allowed ? null : { status: 429, body: { error: result.reason }, headers: { 'Retry-After': String(result.retryAfterSeconds) } };
  }
  return { async dispatch(method: string, path: string, body?: unknown): Promise<Reply> {
    if (method === 'GET' && path === '/api/health') return { status: 200, body: { ok: true, provider: providerStatus({ ...nvidia, enabled: nvidia.enabled && liveSafe && now() < expires }), tavily: tavilyStatus({ ...tavily, enabled: tavily.enabled && liveSafe && now() < expires }), models: { fast: nvidia.model, reasoning: nvidia.reasoningModel, routing: { explain: 'fast', remediate: 'fast', preflightIntent: 'reasoning' } }, limits: { ...limits, scope: budget.durable ? 'durable' : 'process lifetime', liveSafe, enabledUntil: new Date(expires).toISOString() } } };
    const minute = Math.floor(now() / 60000); if (minute !== apiMinute) { apiMinute = minute; apiCount = 0; }
    if (++apiCount > apiMinuteLimit) return { status: 429, body: { error: 'Request rate exceeded. Try again shortly.' }, headers: { 'Retry-After': '60' } };
    try {
      if (method === 'POST' && path === '/api/preflight/prepare') {
        const { activity, context, live } = z.object({ activity: z.string().min(1).max(240), context: ContextSchema, live: z.boolean().default(false) }).strict().parse(body);
        if (context.platform !== 'Shopify' || context.region !== 'US' || context.discountOrigin !== 'native') return { status: 422, body: { status: 'HOLD', error: 'Confirm Shopify, US and native discount context. Other or unknown contexts are outside this bridge.' } };
        const upstream = live && tavily.enabled && !!tavily.key && nvidia.enabled && !!nvidia.key;
        if (upstream && (modelInFlight || searchInFlight || now() < Math.max(nextModel, nextSearch))) return { status: 429, body: { status: 'HOLD', error: 'Wait before another live provider request.' }, headers: { 'Retry-After': String(Math.max(1, Math.ceil((Math.max(nextModel, nextSearch) - now()) / 1000))) } };
        if (upstream) { modelInFlight = true; searchInFlight = true; }
        const reservation: { denial: Reply | null } = { denial: null };
        try {
          const prepared = await preparePreflightBridge(activity, { reviewPreflightSource: options.reviewPreflightSource, live, tavily, nebius: nvidia, request, now,
            reserve: async services => {
              reservation.denial = await reserve(services);
              if (reservation.denial) return false;
              if (services.includes('tavily')) nextSearch = Math.max(nextSearch, now() + 10000);
              if (services.includes('nebius')) nextModel = Math.max(nextModel, now() + 10000);
              return true;
            },
            onRateLimit: (service, seconds) => {
              if (service === 'tavily') nextSearch = Math.max(nextSearch, now() + seconds * 1000);
              else nextModel = Math.max(nextModel, now() + seconds * 1000);
            },
          });
          let proposalId: string | null = null;
          if (prepared.status === 'NEEDS_CONFIRMATION') {
            for (const [id, proposal] of proposals) if (proposal.expires <= now()) proposals.delete(id);
            if (proposals.size >= 50) proposals.delete(proposals.keys().next().value!);
            proposalId = crypto.randomUUID();
            proposals.set(proposalId, { rules: structuredClone(prepared.rules), expires: now() + 600000 });
          }
          return { status: reservation.denial?.status ?? 200, body: { ...prepared, proposalId, proposalTtlSeconds: proposalId ? 600 : null }, ...(reservation.denial?.headers ? { headers: reservation.denial.headers } : {}) };
        } finally { if (upstream) { modelInFlight = false; searchInFlight = false; } }
      }
      if (method === 'POST' && path === '/api/preflight/confirm') {
        const confirmation = z.object({ proposalId: z.string().uuid(), confirmed: z.literal(true), input: z.unknown() }).strict().parse(body);
        const proposal = proposals.get(confirmation.proposalId);
        if (!proposal || proposal.expires <= now()) {
          proposals.delete(confirmation.proposalId);
          return { status: 422, body: { status: 'HOLD', error: 'This proposal is missing, expired or already consumed. Prepare and review it again.' } };
        }
        const input = validatePreflightInput(confirmation.input);
        if (JSON.stringify(input.rules) !== JSON.stringify(proposal.rules)) return { status: 422, body: { status: 'HOLD', error: 'The confirmed rules differ from the reviewed proposal. Review the exact proposal or edit the local simulator independently.' } };
        const simulation = runPreflight(input);
        proposals.delete(confirmation.proposalId);
        return { status: 200, body: { mode: 'offline', status: simulation.status, simulation, sellerConfirmed: true, providerRequests: 0, checkoutStatus: 'HOLD', checkoutVerified: false, note: 'Seller confirmation authorizes this bounded simulation only. Policy references do not verify store eligibility or checkout execution.' } };
      }
      // --- Check any fix (server/check-fix.ts) ---
      if (method === 'GET' && path === '/api/check-fix/examples') return { status: 200, body: CHECK_FIX_EXAMPLES };
      if (method === 'POST' && path === '/api/check-fix') {
        const { fix, context, live } = CheckFixRequestSchema.parse(body);
        const screened = screenCheckFix(fix, context);
        if (screened) return { status: 200, body: screened };
        const upstream = live && tavily.enabled && !!tavily.key && nvidia.enabled && !!nvidia.key;
        if (!upstream) return { status: 200, body: checkFixOffline(fix, context) };
        if (modelInFlight || searchInFlight || now() < Math.max(nextModel, nextSearch)) return { status: 429, body: { error: 'Wait before another live provider request.' }, headers: { 'Retry-After': String(Math.max(1, Math.ceil((Math.max(nextModel, nextSearch) - now()) / 1000))) } };
        modelInFlight = true; searchInFlight = true;
        let denial: Reply | null = null;
        try {
          const result = await checkFixLive(fix, context, { tavilyKey: tavily.key!, nebius: { key: nvidia.key!, planModel: nvidia.model, judgeModel: nvidia.reasoningModel }, request,
            reserve: async services => { denial = await reserve(services); if (denial) return false; nextSearch = Math.max(nextSearch, now() + 10000); nextModel = Math.max(nextModel, now() + 10000); return true; },
            onRateLimit: (service, seconds) => { if (service === 'tavily') nextSearch = Math.max(nextSearch, now() + seconds * 1000); else nextModel = Math.max(nextModel, now() + seconds * 1000); } });
          return denial ?? { status: 200, body: result };
        } finally { modelInFlight = false; searchInFlight = false; }
      }
      if (method === 'GET' && path === '/api/demo') { const csv = createDemoCsv(); return { status: 200, body: { csv, analysis: analyze(csv, 'Northstar Supply · synthetic demo', true) } }; }
      if (method === 'POST' && path === '/api/analyze') { const { csv, assumptions } = Payload.parse(body); const synthetic = csv === createDemoCsv(); return { status: 200, body: analyze(csv, synthetic ? 'Northstar Supply · synthetic demo' : 'Imported CSV', synthetic, assumptions) }; }
      if (method === 'POST' && path === '/api/research') {
        const { kind, context, live } = z.object({ kind: KindSchema, context: ContextSchema, live: z.boolean().default(false) }).strict().parse(body);
        const upstream = live && tavily.enabled && !!tavily.key && context.region === 'US';
        if (upstream && (searchInFlight || now() < nextSearch)) return { status: 429, body: { error: 'Wait before another live search. Provider Retry-After is respected.' }, headers: { 'Retry-After': String(Math.max(1, Math.ceil((nextSearch - now()) / 1000))) } };
        if (upstream) searchInFlight = true;
        try {
          if (upstream) { const denial = await reserve('tavily'); if (denial) return denial; nextSearch = now() + 10000; }
          // Extract is a second billable call: reserve it separately before it is sent.
          const result = await research(kind, context, live, tavily, request, upstream ? { reserveExtract: async () => !await reserve('tavily') } : {});
          if (result.retryAfterSeconds) nextSearch = Math.max(nextSearch, now() + result.retryAfterSeconds * 1000);
          const packet = { ...result, researchId: live ? crypto.randomUUID() : fixtureReference(kind, context) };
          if (live) await store.put(packet);
          return { status: 200, body: packet };
        }
        finally { if (upstream) searchInFlight = false; }
      }
      if (method === 'POST' && path === '/api/remediate') {
        const { csv, issueId, researchId, live, assumptions } = z.object({ csv: z.string().min(1).max(MAX_BYTES), issueId: z.string().max(100), researchId: ResearchIdSchema, live: z.boolean().default(false), assumptions: AssumptionsSchema.optional() }).strict().parse(body);
        const fixture = parseFixtureReference(researchId);
        const packet = fixture ? { ...await research(fixture.kind, fixture.context, false, {}, request), researchId } : await store.get(researchId);
        const issue = analyze(csv, undefined, false, assumptions).issues.find(i => i.id === issueId);
        if (!packet || !issue || packet.kind !== issue.kind) return { status: 422, body: { error: 'Policy evidence expired or does not match this finding. Run the source check again.' } };
        if (packet.status !== 'ok' || !packet.sources.length) return { status: 422, body: { error: 'No relevant policy sources are available for a grounded brief.' } };
        const decision = decidePolicy(issue.kind, packet);
        if (live && (decision.status === 'hold' || decision.status === 'insufficient')) return { status: 422, body: { error: 'Resolve missing context and source constraints before requesting a live synthesis.' } };
        const upstream = live && nvidia.enabled && !!nvidia.key && packet.mode === 'live';
        if (upstream && (modelInFlight || now() < nextModel)) return { status: 429, body: { error: 'Wait before another live model request.' }, headers: { 'Retry-After': '10' } };
        if (upstream) modelInFlight = true;
        try { if (upstream) { const denial = await reserve('nebius'); if (denial) return denial; nextModel = now() + 10000; } return { status: 200, body: await remediate(issue, packet, live, nvidia, request) }; } finally { if (upstream) modelInFlight = false; }
      }
      if (method === 'POST' && path === '/api/explain') {
        const { csv, live = false, assumptions } = Payload.parse(body); const analysis = analyze(csv, undefined, false, assumptions), upstream = live && nvidia.enabled && !!nvidia.key;
        if (upstream && (modelInFlight || now() < nextModel)) return { status: 429, body: { error: 'Wait before another live model request.' }, headers: { 'Retry-After': '10' } };
        if (upstream) modelInFlight = true;
        try { if (upstream) { const denial = await reserve('nebius'); if (denial) return denial; nextModel = now() + 10000; } return { status: 200, body: await explain(analysis, live, nvidia, request) }; } finally { if (upstream) modelInFlight = false; }
      }
      return { status: 404, body: { error: 'Unknown API route.' } };
    } catch (error) {
      if (path.startsWith('/api/preflight/')) return { status: error instanceof z.ZodError || error instanceof PreflightValidationError ? 422 : 400, body: { status: 'HOLD', error: 'The preflight request is invalid or could not complete. No proposal was applied.' } };
      if (error instanceof InputError) return { status: 422, body: { error: error.message } };
      if (error instanceof z.ZodError) return { status: 422, body: { error: 'Request fields or context are invalid. Check the required CSV, finding, platform, and carrier values.' } };
      return { status: 400, body: { error: 'The request could not complete. No credential or upstream response details are exposed.' } };
    }
  } };
}
