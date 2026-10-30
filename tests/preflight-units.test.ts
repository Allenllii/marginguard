import test from 'node:test';
import assert from 'node:assert/strict';
import { amount, applied, dollarsText, hundredths, percentText } from '../src/preflight-units.js';

test('seller dollars and percentages become exact integer cents and basis points', () => {
  assert.deepEqual(hundredths('50', 'dollars'), { value: 5000, rounded: false });
  assert.deepEqual(hundredths('$49.99', 'dollars'), { value: 4999, rounded: false });
  assert.deepEqual(hundredths('0.1', 'dollars'), { value: 10, rounded: false });
  assert.deepEqual(hundredths('2.9', 'percent'), { value: 290, rounded: false });
  assert.deepEqual(hundredths('20%', 'percent'), { value: 2000, rounded: false });
  // A third decimal rounds half away from zero, deterministically and without floats.
  assert.deepEqual(hundredths('1.005', 'dollars'), { value: 101, rounded: true });
  assert.deepEqual(hundredths('1.0049', 'dollars'), { value: 100, rounded: true });
  assert.deepEqual(hundredths('12.345', 'percent'), { value: 1235, rounded: true });
  assert.deepEqual(hundredths('-6.005', 'dollars', true), { value: -601, rounded: true });
  for (const bad of ['', '1e3', '50.0.1', '1,000', '-5', ' $', '0x10', '5 0']) assert.equal(hundredths(bad, 'dollars'), null, bad);
  assert.throws(() => amount('-5', 'Price', 'dollars'), /dollar amount/);
  assert.match(applied('1.005', 'dollars', false), /Rounded to \$1\.01 = 101 cents/);
  assert.equal(applied('50.00', 'dollars', false), 'Uses 5000 cents');
  for (const cents of [0, 5, 5000, -600, 123456]) assert.equal(hundredths(dollarsText(cents), 'dollars', true)!.value, cents);
  for (const bp of [0, 1, 290, 2000, 1235, 10000]) assert.equal(hundredths(percentText(bp), 'percent')!.value, bp);
});
