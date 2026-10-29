import express from 'express';
import helmet from 'helmet';
import { createDemoCsv } from './demo.js';
import { createService } from './service.js';

export function createApp(production = false, env: Record<string, string | undefined> = process.env) {
  const app = express(), service = createService({ env });
  app.disable('x-powered-by');
  const origin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN) : null;
  if (origin && (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)) throw new Error('APP_ORIGIN must be a plain HTTPS origin.');
  app.use((req, res, next) => {
    const host = req.headers.host;
    const local = host?.split(':')[0] === '127.0.0.1' || host?.split(':')[0] === 'localhost';
    if (origin ? host !== origin.host : !local) { res.status(403).json({ error: 'This hostname is not configured for the demo.' }); return; }
    if (req.method === 'POST' && (req.headers.origin ? req.headers.origin !== (origin?.origin || `http://${host}`) : !!origin)) { res.status(403).json({ error: 'A matching same-origin request is required.' }); return; }
    next();
  });
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: production ? ["'self'"] : ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], connectSrc: production ? ["'self'"] : ["'self'", 'ws://127.0.0.1:*'], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: origin ? [] : null } } }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '2200kb', type: 'application/json' }));
  app.get('/api/template', (_req, res) => { res.type('text/csv').attachment('marginguard-demo.csv').send(createDemoCsv()); });
  app.use('/api', async (req, res) => { const reply = await service.dispatch(req.method, `/api${req.path}`, req.body); for (const [k, v] of Object.entries(reply.headers ?? {})) res.setHeader(k, v); res.status(reply.status).json(reply.body); });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { const large = error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large'; res.status(large ? 413 : 400).json({ error: large ? 'Request exceeds the upload size limit.' : 'Could not parse this request.' }); });
  return app;
}
