import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { FRONTEND_DIRECTORY } from '../shared/build-paths.js';

test('Worker packaging preserves the independent Node frontend and copies only deployment inputs', async () => {
  assert.equal(FRONTEND_DIRECTORY, 'frontend-dist');
  const root = await mkdtemp(path.join(tmpdir(), 'marginguard-layout-'));
  for (const name of ['scripts', 'worker', '.openai', FRONTEND_DIRECTORY, 'dist']) await mkdir(path.join(root, name));
  await copyFile('scripts/build-sites.mjs', path.join(root, 'scripts/build-sites.mjs'));
  const html = '<!doctype html><title>Node frontend must survive</title>';
  const manifest = JSON.stringify({ project_id: 'fixture-not-a-real-site', d1: 'DB', r2: null });
  await writeFile(path.join(root, FRONTEND_DIRECTORY, 'index.html'), html);
  await writeFile(path.join(root, 'worker/index.js'), 'export default { fetch() { return new Response("fixture"); } };');
  await writeFile(path.join(root, '.openai/hosting.json'), manifest);
  await writeFile(path.join(root, 'dist/stale.html'), 'old generated artifact');
  execFileSync(process.execPath, [path.join(root, 'scripts/build-sites.mjs')], { cwd: root, stdio: 'pipe' });
  assert.equal(await readFile(path.join(root, FRONTEND_DIRECTORY, 'index.html'), 'utf8'), html);
  assert.deepEqual((await readdir(path.join(root, 'dist'))).sort(), ['.openai', 'server']);
  assert.equal(await readFile(path.join(root, 'dist/.openai/hosting.json'), 'utf8'), manifest);
  assert.equal(await readFile(path.join(root, 'dist/server/index.js'), 'utf8'), await readFile(path.join(root, 'worker/index.js'), 'utf8'));
  assert.match(await readFile('server/index.ts', 'utf8'), /FRONTEND_DIRECTORY/);
  assert.match(await readFile('vite.config.ts', 'utf8'), /outDir: FRONTEND_DIRECTORY/);
});

test('an occupied production port exits with an error instead of claiming startup success', async () => {
  const occupied = createServer();
  await new Promise<void>((resolve, reject) => { occupied.once('error', reject); occupied.listen(0, '127.0.0.1', resolve); });
  try {
    const address = occupied.address(); assert.ok(address && typeof address !== 'string');
    const outcome = await new Promise<{ code: unknown; stdout: string; stderr: string }>(resolve => {
      execFile(process.execPath, ['--import', 'tsx', 'server/index.ts', '--production', '--offline-qa'], { cwd: process.cwd(), timeout: 10000, env: { ...process.env, PORT: String(address.port), TAVILY_ENABLE_LIVE: 'false', NEBIUS_ENABLE_LIVE: 'false', PROVIDER_HARD_CAPS_VERIFIED: 'false' } }, (error, stdout, stderr) => resolve({ code: error?.code, stdout, stderr }));
    });
    assert.equal(outcome.code, 1); assert.match(outcome.stderr, /EADDRINUSE/); assert.doesNotMatch(outcome.stdout, /MarginGuard production:/);
  } finally { await new Promise<void>(resolve => occupied.close(() => resolve())); }
});
