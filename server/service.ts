import { z } from 'zod';
import { analyze, InputError, MAX_BYTES } from './analysis.js';
import { createDemoCsv } from './demo.js';
import { explain, providerStatus, remediate } from './nebius.js';
import { ContextSchema, KindSchema, research, tavilyStatus } from './tavily.js';
import { decidePolicy } from '../shared/policy-decision.js';
import { budgetLimits, MemoryBudget, type LiveBudget, type LiveService } from './budget.js';
import type { ResearchPacket } from '../shared/types.js';

export const AssumptionsSchema = z.object({ discountCeilingPercent: z.number().int().min(0).max(60), shippingSubsidyCents: z.number().int().min(0).max(2000) }).strict();
const Payload = z.object({ csv: z.string().min(1).max(MAX_BYTES), live: z.boolean().optional(), assumptions: AssumptionsSchema.optional() }).strict();
export interface Reply { status: number; body: unknown; headers?: Record<string, string>; }
export interface ResearchStore { get(id: string): Promise<ResearchPacket | null>; put(packet: ResearchPacket): Promise<void>; }
export class MemoryResearchStore implements ResearchStore {
  private records = new Map<string, { packet: ResearchPacket; expires: number }>();
  async get(id: string) { const r = this.records.get(id); return r && r.expires > Date.now() ? r.packet : null; }
  async put(packet: ResearchPacket) { for (const [id, r] of this.records) if (r.expires < Date.now()) this.records.delete(id); if (this.records.size >= 50) this.records.delete(this.records.keys().next().value!); this.records.set(packet.researchId, { packet, expires: Date.now() + 600000 }); }
}
export function createService(options: { env?: Record<string, string | undefined>; budget?: LiveBudget; store?: ResearchStore; request?: typeof fetch; now?: () => number } = {}) {
  const env = options.env ?? {}, now = options.now ?? Date.now, request = options.request ?? fetch;
  const limits = budgetLimits(env), budget = options.budget ?? new MemoryBudget(limits), store = options.store ?? new MemoryResearchStore();
  const nvidia = { key: env.NEBIUS_API_KEY, model: env.NEBIUS_MODEL || 'nvidia/Nemotron-3_5-Lightning', enabled: env.NEBIUS_ENABLE_LIVE === 'true' };
  const tavily = { key: env.TAVILY_API_KEY, enabled: env.TAVILY_ENABLE_LIVE === 'true' };
  const hosted = env.PUBLIC_DEMO === 'true', liveSafe = !hosted || (budget.durable && env.PROVIDER_HARD_CAPS_VERIFIED === 'true');
  const expires = Date.parse(env.LIVE_ENABLED_UNTIL || '2026-12-16T00:00:00Z');
  if (!Number.isFinite(expires)) throw new Error('LIVE_ENABLED_UNTIL must be an ISO date.');
  let modelInFlight = false, searchInFlight = false, nextModel = 0, nextSearch = 0, apiMinute = -1, apiCount = 0;
  async function reserve(service: LiveService): Promise<Reply | null> {
    if (!liveSafe) return { status: 503, body: { error: 'Public live calls require a durable budget store and verified provider hard caps. Offline demo remains available.' } };
    if (now() >= expires) return { status: 503, body: { error: 'This live-demo authorization window has ended. Offline analysis remains available.' } };
    const result = await budget.reserve(service, now());
    return result.allowed ? null : { status: 429, body: { error: result.reason }, headers: { 'Retry-After': String(result.retryAfterSeconds) } };
  }
  return { async dispatch(method: string, path: string, body?: unknown): Promise<Reply> {
    if (method === 'GET' && path === '/api/health') return { status: 200, body: { ok: true, provider: providerStatus({ ...nvidia, enabled: nvidia.enabled && liveSafe && now() < expires }), tavily: tavilyStatus({ ...tavily, enabled: tavily.enabled && liveSafe && now() < expires }), limits: { ...limits, scope: budget.durable ? 'durable' : 'process lifetime', liveSafe, enabledUntil: new Date(expires).toISOString() } } };
    const minute = Math.floor(now() / 60000); if (minute !== apiMinute) { apiMinute = minute; apiCount = 0; }
    if (++apiCount > 120) return { status: 429, body: { error: 'Request rate exceeded. Try again shortly.' }, headers: { 'Retry-After': '60' } };
    try {
      if (method === 'GET' && path === '/api/demo') { const csv = createDemoCsv(); return { status: 200, body: { csv, analysis: analyze(csv, 'Northstar Supply · synthetic demo', true) } }; }
      if (method === 'POST' && path === '/api/analyze') { const { csv, assumptions } = Payload.parse(body); const synthetic = csv === createDemoCsv(); return { status: 200, body: analyze(csv, synthetic ? 'Northstar Supply · synthetic demo' : 'Imported CSV', synthetic, assumptions) }; }
      if (method === 'POST' && path === '/api/research') {
        const { kind, context, live } = z.object({ kind: KindSchema, context: ContextSchema, live: z.boolean().default(false) }).strict().parse(body);
        const upstream = live && tavily.enabled && !!tavily.key && context.region === 'US';
        if (upstream && (searchInFlight || now() < nextSearch)) return { status: 429, body: { error: 'Wait before another live search. Provider Retry-After is respected.' }, headers: { 'Retry-After': String(Math.max(1, Math.ceil((nextSearch - now()) / 1000))) } };
        if (upstream) searchInFlight = true;
        try { if (upstream) { const denial = await reserve('tavily'); if (denial) return denial; nextSearch = now() + 10000; } const result = await research(kind, context, live, tavily, request); if (result.retryAfterSeconds) nextSearch = Math.max(nextSearch, now() + result.retryAfterSeconds * 1000); const packet = { ...result, researchId: crypto.randomUUID() }; await store.put(packet); return { status: 200, body: packet }; }
        finally { if (upstream) searchInFlight = false; }
      }
      if (method === 'POST' && path === '/api/remediate') {
        const { csv, issueId, researchId, live, assumptions } = z.object({ csv: z.string().min(1).max(MAX_BYTES), issueId: z.string().max(100), researchId: z.string().uuid(), live: z.boolean().default(false), assumptions: AssumptionsSchema.optional() }).strict().parse(body);
        const packet = await store.get(researchId), issue = analyze(csv, undefined, false, assumptions).issues.find(i => i.id === issueId);
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
      if (error instanceof InputError) return { status: 422, body: { error: error.message } };
      if (error instanceof z.ZodError) return { status: 422, body: { error: 'Request fields or context are invalid. Check the required CSV, finding, platform, and carrier values.' } };
      return { status: 400, body: { error: 'The request could not complete. No credential or upstream response details are exposed.' } };
    }
  } };
}
