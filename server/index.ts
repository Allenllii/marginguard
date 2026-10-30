import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { FRONTEND_DIRECTORY } from '../shared/build-paths.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const production = process.argv.includes('--production');
const runtimeEnv = process.argv.includes('--offline-qa') ? { ...process.env, TAVILY_ENABLE_LIVE: 'false', NEBIUS_ENABLE_LIVE: 'false', QA_API_MINUTE_LIMIT: '2000' } : process.env;
const app = createApp(production, runtimeEnv);
if (production) { app.use(express.static(path.join(root, FRONTEND_DIRECTORY))); app.get('/', (_req, res) => res.sendFile(path.join(root, FRONTEND_DIRECTORY, 'index.html'))); }
else { const { createServer } = await import('vite'); const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'spa' }); app.use(vite.middlewares); }
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535');
const host = process.env.BIND_HOST || '127.0.0.1';
if (!['127.0.0.1', '0.0.0.0'].includes(host) || (host === '0.0.0.0' && !process.env.APP_ORIGIN)) throw new Error('Public binding requires a configured APP_ORIGIN.');
const server = app.listen(port, host, (error?: NodeJS.ErrnoException) => {
  if (error) { console.error(`MarginGuard failed to bind ${host}:${port}: ${error.code ?? 'startup error'}`); process.exitCode = 1; return; }
  console.log(`MarginGuard ${production ? 'production' : 'development'}: ${process.env.APP_ORIGIN || `http://127.0.0.1:${port}`} · live inference requires explicit configuration and click`);
});
process.once('SIGTERM', () => server.close());
