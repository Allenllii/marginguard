import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { budgetLimits, D1Budget, MemoryBudget, type D1Like, type D1Statement } from '../server/budget.js';
import { createService } from '../server/service.js';
import { boundedJson } from '../server/http.js';

test('memory caps reserve attempts atomically and respect minute/day/total boundaries', async () => {
  const now = Date.parse('2026-10-27T20:00:00Z'), b = new MemoryBudget({ minute: 2, daily: 3, total: 4 });
  const first = await Promise.all(Array.from({ length: 10 }, () => b.reserve('tavily', now)));
  assert.equal(first.filter(r => r.allowed).length, 2);
  assert.equal((await b.reserve('tavily', now + 60000)).allowed, true);
  assert.equal((await b.reserve('tavily', now + 120000)).allowed, false);
  assert.equal((await b.reserve('tavily', now + 86400000)).allowed, true);
  assert.equal((await b.reserve('tavily', now + 86460000)).allowed, false);
  assert.throws(() => budgetLimits({ LIVE_DAILY_LIMIT: '10000' }));
});
test('durable SQL budgets survive a new runtime instance and concurrent attempts', async () => {
  const db = new DatabaseSync(':memory:'); db.exec(await readFile('drizzle/0000_open_lightspeed.sql', 'utf8'));
  const adapter: D1Like = { prepare(sql) { let args: (string | number | null)[] = []; const statement: D1Statement = { bind(...values) { args = values as typeof args; return statement; }, async first<T>() { return (db.prepare(sql).get(...args) ?? null) as T | null; }, async run() { return db.prepare(sql).run(...args); } }; return statement; }, async batch(statements) { const values = []; for (const s of statements) values.push(await s.run()); return values; } };
  const now = Date.parse('2026-10-27T20:00:00Z'), limits = { minute: 2, daily: 3, total: 4 };
  const a = new D1Budget(adapter, limits), b = new D1Budget(adapter, limits);
  const attempts = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).reserve('nebius', now)));
  assert.equal(attempts.filter(r => r.allowed).length, 2);
  assert.equal((await new D1Budget(adapter, limits).reserve('nebius', now + 60000)).allowed, true);
  assert.equal((await a.reserve('nebius', now + 120000)).allowed, false);
  assert.equal((await a.reserve('nebius', now + 86400000)).allowed, true);
  assert.equal((await b.reserve('nebius', now + 86460000)).allowed, false);
  db.close();
});
test('a multi-attempt set is reserved all-or-nothing in memory and in durable SQL', async () => {
  const db = new DatabaseSync(':memory:'); db.exec(await readFile('drizzle/0000_open_lightspeed.sql', 'utf8'));
  const adapter: D1Like = { prepare(sql) { let args: (string | number | null)[] = []; const statement: D1Statement = { bind(...values) { args = values as typeof args; return statement; }, async first<T>() { return (db.prepare(sql).get(...args) ?? null) as T | null; }, async run() { return db.prepare(sql).run(...args); } }; return statement; }, async batch(statements) { const values = []; for (const s of statements) values.push(await s.run()); return values; } };
  const now = Date.parse('2026-10-27T20:00:00Z'), pipeline = ['tavily', 'tavily', 'nebius', 'nebius'] as const;
  for (const budget of [new MemoryBudget({ minute: 3, daily: 20, total: 100 }), new D1Budget(adapter, { minute: 3, daily: 20, total: 100 })]) {
    assert.equal((await budget.reserve(pipeline, now)).allowed, true);
    const denied = await budget.reserve(pipeline, now);
    assert.equal(denied.allowed, false); assert.equal(denied.retryAfterSeconds, 60);
    // The denied set counted nothing: exactly one more attempt per service fits this minute.
    assert.equal((await budget.reserve(['tavily', 'nebius'], now)).allowed, true);
    assert.equal((await budget.reserve('tavily', now)).allowed, false);
    assert.equal((await budget.reserve(pipeline, now + 60000)).allowed, true);
  }
  const used = db.prepare("SELECT service, SUM(used) AS used FROM live_request_days GROUP BY service ORDER BY service").all();
  assert.deepEqual(used.map(row => ({ ...row })), [{ service: 'nebius', used: 5 }, { service: 'tavily', used: 5 }]);
  const day = new MemoryBudget({ minute: 6, daily: 3, total: 100 });
  assert.equal((await day.reserve(['tavily', 'tavily'], now)).allowed, true);
  const overDay = await day.reserve(['tavily', 'tavily'], now + 60000);
  assert.equal(overDay.allowed, false); assert.equal(overDay.retryAfterSeconds, 86400);
  db.close();
});
test('public live requests fail closed without durable budgets and provider hard caps', async () => {
  let requests = 0;
  const service = createService({ env: { PUBLIC_DEMO: 'true', TAVILY_ENABLE_LIVE: 'true', TAVILY_API_KEY: 'fixture-not-real' }, request: (async () => { requests++; throw new Error('must not call'); }) as typeof fetch });
  const health = (await service.dispatch('GET', '/api/health')).body as { tavily: { mode: string } };
  assert.equal(health.tavily.mode, 'fixture');
  assert.equal((await service.dispatch('POST', '/api/research', { kind: 'discount', context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' }, live: true })).status, 503);
  assert.equal(requests, 0);
});
test('streamed provider data is bounded before full buffering and invalid UTF-8 rejected', async () => {
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new Uint8Array(200)); }, cancel() { canceled = true; } });
  await assert.rejects(boundedJson(new Response(stream), 100)); assert.equal(canceled, true);
  await assert.rejects(boundedJson(new Response(new Uint8Array([0xff])), 100));
});
