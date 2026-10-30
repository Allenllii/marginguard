import { createService, type ResearchStore } from '../server/service.js';
import { D1Budget, budgetLimits, type D1Like } from '../server/budget.js';
import { boundedJson } from '../server/http.js';
import { createDemoCsv } from '../server/demo.js';
import { edgeFetch } from './edge-fetch.js';
import type { ResearchPacket } from '../shared/types.js';

declare const __MG_ASSETS__: Record<string, { body: string; type: string }>;
interface WorkerEnv { DB?: D1Like; [key: string]: unknown; }
class D1ResearchStore implements ResearchStore {
  constructor(private db: D1Like) {}
  async get(id: string) { const row = await this.db.prepare('SELECT payload FROM policy_cache WHERE id = ? AND expires > ?').bind(id, Date.now()).first<{ payload: string }>(); return row ? JSON.parse(row.payload) as ResearchPacket : null; }
  async put(packet: ResearchPacket) { await this.db.batch([this.db.prepare('DELETE FROM policy_cache WHERE expires <= ?').bind(Date.now()), this.db.prepare('INSERT OR REPLACE INTO policy_cache(id, payload, expires) VALUES (?, ?, ?)').bind(packet.researchId, JSON.stringify(packet), Date.now() + 600000), this.db.prepare('DELETE FROM policy_cache WHERE id NOT IN (SELECT id FROM policy_cache ORDER BY expires DESC LIMIT 50)')]); }
}
const services = new WeakMap<WorkerEnv, ReturnType<typeof createService>>();
const headers = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
};
export default { async fetch(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url), origin = request.headers.get('Origin');
  const json = (value: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
  if (request.method === 'POST' && origin !== url.origin) return json({ error: 'A matching same-origin request is required.' }, 403);
  if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { ...headers, 'Content-Type': 'text/plain' } });
  if (url.pathname === '/favicon.ico') return new Response(null, { status: 204, headers });
  if (url.pathname === '/api/template' && request.method === 'GET') return new Response(createDemoCsv(), { headers: { ...headers, 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="marginguard-demo.csv"', 'Cache-Control': 'no-store' } });
  if (url.pathname.startsWith('/api/')) {
    let service = services.get(env);
    if (!service) {
      const values = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
      // Fail closed for public live calls without a migrated durable budget binding.
      values.PUBLIC_DEMO = 'true';
      service = createService({ env: values, request: edgeFetch(), ...(env.DB ? { budget: new D1Budget(env.DB, budgetLimits(values)), store: new D1ResearchStore(env.DB) } : {}) }); services.set(env, service);
    }
    let body: unknown;
    if (request.method === 'POST') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Use application/json.' }, 415);
      try { body = await boundedJson(request as unknown as Response, 2252800); } catch { return json({ error: 'Invalid JSON or request exceeds the upload limit.' }, 413); }
    }
    const result = await service.dispatch(request.method, url.pathname, body);
    return json(result.body, result.status, result.headers);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed.' }, 405);
  const asset = __MG_ASSETS__[url.pathname];
  return asset ? new Response(request.method === 'HEAD' ? null : asset.body, { headers: { ...headers, 'Content-Type': asset.type, 'Cache-Control': url.pathname === '/' ? 'no-cache' : 'public, max-age=86400' } }) : json({ error: 'Not found.' }, 404);
} };
