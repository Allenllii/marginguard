import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const hash = value => createHash('sha256').update(value).digest('hex');
const expectedProject = JSON.parse(await readFile(resolve(root, '.openai/hosting.json'), 'utf8')).project_id;
const source = await readFile(resolve(root, 'offline-dist/server/index.js'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(root, 'offline-dist/.openai/hosting.json'), 'utf8'));
assert.equal(manifest.project_id, expectedProject); assert.equal(manifest.d1, null); assert.equal(manifest.r2, null);
for (const directory of ['offline-dist', 'dist']) {
  assert.deepEqual((await readdir(resolve(root, directory))).sort(), ['.openai', 'server']);
  assert.deepEqual(await readdir(resolve(root, directory, 'server')), ['index.js']);
  assert.deepEqual(await readdir(resolve(root, directory, '.openai')), ['hosting.json']);
  assert.equal(await readFile(resolve(root, directory, 'server/index.js'), 'utf8'), source);
  assert.deepEqual(JSON.parse(await readFile(resolve(root, directory, '.openai/hosting.json'), 'utf8')), manifest);
}
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
const runtime = new Proxy({}, { get() { throw Error('Runtime configuration read'); }, ownKeys() { throw Error('Runtime configuration enumerated'); } });
const previousFetch = globalThis.fetch; let outboundAttempts = 0, assertions = 0;
globalThis.fetch = async () => { outboundAttempts++; throw Error('Outbound request blocked in offline candidate verification'); };
const base = 'https://judge-demo.example';
const request = (path, body) => new Request(base + path, body ? { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
const check = async (path, body, status = 200) => { const response = await worker.fetch(request(path, body), runtime); assert.equal(response.status, status); assertions++; return response; };
try {
  const page = await check('/'); assert.match(page.headers.get('content-type'), /text\/html/u); const html = await page.text();
  const assets = [...html.matchAll(/(?:src|href)="([^"?]+\.(js|css))"/gu)]; assert.ok(assets.length >= 2);
  for (const [, path, extension] of assets) { const asset = await check(path); assert.match(asset.headers.get('content-type'), extension === 'js' ? /javascript/u : /text\/css/u); }
  const health = await (await check('/api/health')).json();
  assert.equal(health.provider.mode, 'fixture'); assert.equal(health.tavily.mode, 'fixture'); assert.equal(health.limits.liveSafe, false);
  const demo = await (await check('/api/demo')).json(); assert.equal(demo.analysis.orders.length, 504); assert.equal(demo.analysis.totals.opportunity, 191858);
  const analysis = await (await check('/api/analyze', { csv: demo.csv })).json(); assert.equal(analysis.totals.revenue, 3984622);
  assert.match(await (await check('/api/template')).text(), /^order_id,order_date,sku/u);
  const context = { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' };
  const refused = await (await check('/api/research', { kind: 'discount', context, live: true })).json(); assert.equal(refused.proof, undefined); assert.equal(refused.sources.length, 0);
  const packet = await (await check('/api/research', { kind: 'discount', context, live: false })).json(); assert.equal(packet.mode, 'fixture'); assert.equal(packet.checkedAt, null); assert.equal(packet.proof, undefined); assert.match(packet.note, /^Recorded live Tavily Search \+ Extract/u); assert.deepEqual(packet.retrieval.steps.map(step => step.op), ['search', 'extract', 'extract']);
  const remedy = await (await check('/api/remediate', { csv: demo.csv, issueId: 'discount-stacking', researchId: packet.researchId, live: false })).json(); assert.equal(remedy.mode, 'fixture'); assert.match(remedy.nextStep, /Audit staff\/manual POS/u);
  const coldWorker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#cold-isolate`)).default;
  const coldResponse = await coldWorker.fetch(request('/api/remediate', { csv: demo.csv, issueId: 'discount-stacking', researchId: packet.researchId, live: false }), runtime);
  assert.equal(coldResponse.status, 200); assertions++;
  const coldRemedy = await coldResponse.json(); assert.equal(coldRemedy.mode, 'fixture'); assert.equal(coldRemedy.proof, undefined); assert.equal(coldRemedy.nextStep, remedy.nextStep);
  const crossOrigin = await worker.fetch(new Request(base + '/api/analyze', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' }), runtime); assert.equal(crossOrigin.status, 403); assertions++;
  const invalid = await worker.fetch(new Request(base + '/api/analyze', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{broken' }), runtime); assert.equal(invalid.status, 413); assertions++;
  assert.equal(outboundAttempts, 0);
  const proof = { executedAt: new Date().toISOString(), scope: 'Local forced-offline Worker candidate, not a deployed Site or final benchmark', routeChecks: assertions, coldIsolateFixtureDraft: true, embeddedAssetChecks: assets.length, outboundAttempts, runtimeConfigIgnored: true, databaseBindingRequired: false, candidateAndStagedDistMatch: true, workerSha256: hash(source), manifestSha256: hash(JSON.stringify(manifest)), hostingUrl: null };
  await writeFile(resolve(root, 'evidence/offline-artifact-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(`Forced-offline candidate passed ${assertions} route checks; ${assets.length} embedded assets; zero outbound attempts; no runtime credential or DB access. No deployment performed.`);
} finally { globalThis.fetch = previousFetch; }
