import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { budgetLimits } from '../server/budget.js';

// A bad value here took the live Worker down (Invalid LIVE_MINUTE_LIMIT) on 2026-10-30.
test('the deployed wrangler.toml vars pass the server\'s own budget validation', () => {
  const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  const vars = Object.fromEntries([...toml.matchAll(/^([A-Z_]+)\s*=\s*"([^"]*)"/gmu)].map(m => [m[1], m[2]]));
  const limits = budgetLimits(vars);
  assert.equal(limits.minute, Number(vars.LIVE_MINUTE_LIMIT));
  assert.ok(limits.minute >= 4, 'Check a fix needs three Nebius calls inside one minute');
  assert.equal(vars.PROVIDER_HARD_CAPS_VERIFIED, 'true');
});
