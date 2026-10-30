import { build } from 'esbuild';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { FRONTEND_DIRECTORY } from '../shared/build-paths.js';
const offlineOnly = process.argv.includes('--offline-only');
assert.ok(process.argv.slice(2).every(arg => arg === '--offline-only'), 'Unknown Worker build option');
const assets: Record<string, { body: string; type: string }> = {};
async function collect(dir: string) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name); if (item.isDirectory()) { await collect(file); continue; }
    const name = path.relative(FRONTEND_DIRECTORY, file).replaceAll('\\', '/');
    const type = name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8';
    assets[name === 'index.html' ? '/' : `/${name}`] = { body: await readFile(file, 'utf8'), type };
  }
}
await collect(FRONTEND_DIRECTORY);
const result = await build({ entryPoints: [offlineOnly ? 'worker/offline-entry.ts' : 'worker/entry.ts'], bundle: true, platform: 'browser', format: 'esm', target: 'es2022', write: false, minify: true, legalComments: 'inline', define: { 'process.env': '{}', __MG_ASSETS__: JSON.stringify(assets) } });
const code = result.outputFiles[0].text;
assert.ok(!/from\s*["']node:|require\(["']node:/.test(code), 'Worker must not depend on Node builtins');
const out = offlineOnly ? 'offline-dist' : '.';
if (offlineOnly) {
  await mkdir('offline-dist/server', { recursive: true }); await mkdir('offline-dist/.openai', { recursive: true });
  await writeFile('offline-dist/server/index.js', code);
} else { await mkdir('worker', { recursive: true }); await writeFile('worker/index.js', code); }
// The source manifest is copied by packaging; never rewrite its registered identity here.
const sourceManifest = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
if (offlineOnly) {
  const offlineManifest = JSON.stringify({ ...sourceManifest, d1: null, r2: null }, null, 2) + '\n';
  await writeFile('offline-dist/.openai/hosting.json', offlineManifest);
  // Native Sites packaging consumes dist/. The offline command first performs
  // the standard clean build, then selects these two verified candidate files.
  await mkdir('dist/server', { recursive: true }); await mkdir('dist/.openai', { recursive: true });
  await writeFile('dist/server/index.js', code); await writeFile('dist/.openai/hosting.json', offlineManifest);
}
const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
assert.equal(typeof module.default.fetch, 'function');
const health = await module.default.fetch(new Request('https://marginguard.example/api/health'), {});
assert.equal(health.status, 200); assert.equal((await health.json()).provider.mode, 'fixture');
const page = await module.default.fetch(new Request('https://marginguard.example/'), {}); assert.equal(page.status, 200); assert.ok((await page.text()).includes('MarginGuard'));
const env = {}, post = (path: string, value: unknown) => module.default.fetch(new Request(`https://marginguard.example${path}`, { method: 'POST', headers: { Origin: 'https://marginguard.example', 'Content-Type': 'application/json' }, body: JSON.stringify(value) }), env);
const demo = await (await module.default.fetch(new Request('https://marginguard.example/api/demo'), env)).json();
assert.equal(demo.analysis.orders.length, 504); assert.equal(demo.analysis.fingerprint, '0aca9bee505e7050');
assert.equal((await (await post('/api/analyze', { csv: demo.csv })).json()).totals.opportunity, 191858);
const packet = await (await post('/api/research', { kind: 'discount', context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' }, live: false })).json();
assert.equal(packet.mode, 'fixture'); assert.equal(packet.checkedAt, null);
const remedy = await (await post('/api/remediate', { csv: demo.csv, issueId: 'discount-stacking', researchId: packet.researchId, live: false })).json();
assert.equal(remedy.mode, 'fixture'); assert.equal(remedy.proof, undefined); assert.match(remedy.fallbackReason, /^Recorded Nemotron/); assert.ok(remedy.nextStep.includes('filter for flagged orders'));
assert.equal((await module.default.fetch(new Request('https://marginguard.example/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), env)).status, 403);
console.log(`Portable Worker ESM built: ${offlineOnly ? out + '/server/index.js' : './worker/index.js'} (${Buffer.byteLength(code)} bytes), ${Object.keys(assets).length} embedded assets, no Node builtins; offline health/page smoke passed. Profile: ${offlineOnly ? 'forced offline, ignores runtime provider configuration' : 'standard, hosted live gates enforced'}.`);
