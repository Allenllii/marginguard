import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function digestTree(dir: string): Promise<string> {
  const entries: string[] = [];
  async function visit(current: string) {
    for (const item of (await readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, item.name);
      if (item.isDirectory()) await visit(file);
      else entries.push(path.relative(dir, file).replaceAll('\\', '/') + ':' + createHash('sha256').update(await readFile(file)).digest('hex'));
    }
  }
  await visit(dir); return createHash('sha256').update(entries.join('\n')).digest('hex');
}

test('Drizzle really generates the canonical SQL and repeat generation preserves migration history', async () => {
  const root = process.cwd(), temp = await mkdtemp(path.join(tmpdir(), 'marginguard-drizzle-'));
  const fresh = path.join(temp, 'fresh'), stable = path.join(temp, 'stable');
  const generate = (out: string) => execFileSync(process.execPath, [path.resolve('node_modules/drizzle-kit/bin.cjs'), 'generate', '--dialect', 'sqlite', '--schema', './db/schema.ts', '--out', path.relative(root, out).replaceAll('\\', '/'), '--name', 'verification'], { cwd: root, timeout: 20000, encoding: 'utf8', env: { ...process.env, TAVILY_ENABLE_LIVE: 'false', NEBIUS_ENABLE_LIVE: 'false', PROVIDER_HARD_CAPS_VERIFIED: 'false' } });
  generate(fresh);
  const normalize = (s: string) => s.replaceAll('\r\n', '\n').trim();
  assert.equal(normalize(await readFile(path.join(fresh, '0000_verification.sql'), 'utf8')), normalize(await readFile('drizzle/0000_open_lightspeed.sql', 'utf8')));
  const snapshot = JSON.parse(await readFile(path.join(fresh, 'meta/0000_snapshot.json'), 'utf8'));
  const canonical = JSON.parse(await readFile('drizzle/meta/0000_snapshot.json', 'utf8'));
  assert.deepEqual(snapshot.tables, canonical.tables); assert.equal(snapshot.dialect, canonical.dialect);
  await cp('drizzle', stable, { recursive: true });
  const before = await digestTree(stable), output = generate(stable);
  assert.match(output, /No schema changes/i); assert.equal(await digestTree(stable), before);
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
  assert.equal(journal.entries.length, 1); assert.equal(journal.entries[0].tag, '0000_open_lightspeed');
  assert.equal(canonical.id, '179e5b67-b685-47a2-89c8-9a0c0619491a');
});

test('canonical migration enforces budget keys, nonnegative counts and policy-cache constraints', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(await readFile('drizzle/0000_open_lightspeed.sql', 'utf8'));
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    assert.deepEqual(tables.map(row => row.name), ['live_request_days', 'live_request_minutes', 'policy_cache']);
    for (const table of ['live_request_days', 'live_request_minutes']) {
      const insert = db.prepare(`INSERT INTO ${table}(service, period, used) VALUES (?, ?, ?)`);
      insert.run('tavily', 'period-a', 0); insert.run('nebius', 'period-a', 1); insert.run('tavily', 'period-b', 1);
      assert.throws(() => insert.run('tavily', 'period-a', 1), /UNIQUE constraint/);
      assert.throws(() => insert.run('tavily', 'negative', -1), /CHECK constraint/);
      assert.throws(() => insert.run(null, 'null-service', 0), /NOT NULL constraint/);
      assert.throws(() => insert.run('tavily', null, 0), /NOT NULL constraint/);
      assert.throws(() => insert.run('tavily', 'null-used', null), /NOT NULL constraint/);
    }
    const cache = db.prepare('INSERT INTO policy_cache(id,payload,expires) VALUES(?,?,?)');
    cache.run('one', '{}', 0);
    assert.throws(() => cache.run('one', '{}', 1), /UNIQUE constraint/);
    assert.throws(() => cache.run(null, '{}', 0), /NOT NULL constraint/);
    assert.throws(() => cache.run('no-payload', null, 0), /NOT NULL constraint/);
    assert.throws(() => cache.run('no-expiry', '{}', null), /NOT NULL constraint/);
    assert.deepEqual(db.prepare('PRAGMA index_info(policy_cache_expiry)').all().map(row => row.name), ['expires']);
  } finally { db.close(); }
});
