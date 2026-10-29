import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, HEADERS, parseOrders, simulate, returnIssueId } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
const csv = (...rows: string[]) => [HEADERS.join(','), ...rows].join('\n');
const base = 'X1,2026-09-28,ITEM,Home,100.00,10.00,1,30.00,5.00,7.00,0.00,0.00';

test('hand-calculated order contribution and distinct leakage components', () => {
  const a = analyze(csv('X1,2026-09-28,ITEM,Home,100.00,40.00,2,30.00,5.00,15.00,0.00,0.00'));
  assert.deepEqual(a.totals, { gross: 10000, revenue: 6500, contribution: 2000, margin: 2000 / 6500, opportunity: 2700, returns: 0 });
  assert.equal(a.issues.find(i => i.kind === 'discount')!.exposure, 2000);
  assert.equal(a.issues.find(i => i.kind === 'shipping')!.exposure, 700);
  assert.deepEqual(a.issues[0].rowIds, [2]);
});
test('refunds retain COGS, deduct handling, and exclude discount/shipping recovery', () => {
  const a = analyze(csv('X1,2026-09-28,ITEM,Home,100.00,40.00,2,30.00,5.00,15.00,60.00,7.50'));
  assert.equal(a.totals.revenue, 500); assert.equal(a.totals.contribution, -4750); assert.equal(a.issues.length, 0);
});
test('seed fixture has three known planted issue populations', () => {
  assert.equal(createDemoCsv(), createDemoCsv());
  const a = analyze(createDemoCsv());
  assert.equal(a.orders.length, 504); assert.equal(a.issues.length, 3);
  assert.equal(a.issues.find(i => i.kind === 'discount')!.rowIds.length, 28);
  assert.equal(a.issues.find(i => i.kind === 'shipping')!.rowIds.length, 21);
  assert.equal(a.issues.find(i => i.kind === 'returns')!.rowIds.length, 14);
  assert.equal(a.issues.find(i => i.kind === 'returns')!.metrics[0].value, '33.3%');
  assert.equal(a.issues.find(i => i.kind === 'returns')!.metrics[1].value, '5.6%');
});
test('exact guardrail values do not trigger a finding', () => {
  const a = analyze(csv('X1,2026-09-28,ITEM,Home,100.00,20.00,2,30.00,5.00,8.00,0.00,0.00'));
  assert.equal(a.issues.length, 0);
});
test('scenario zero, full recovery, rounding, and invalid rate bounds', () => {
  const a = analyze(createDemoCsv());
  const full = Object.fromEntries(a.issues.map(i => [i.id, 100]));
  assert.equal(simulate(a, {}).recovery, 0);
  assert.equal(simulate(a, full).recovery, a.totals.opportunity);
  assert.equal(simulate(a, full).contribution, a.totals.contribution + a.totals.opportunity);
  assert.throws(() => simulate(a, { [a.issues[0].id]: 101 }));
  assert.throws(() => simulate(a, { [a.issues[0].id]: NaN }));
});
test('findings are independent of CSV row ordering', () => {
  const lines = createDemoCsv().trim().split('\n');
  const a = analyze(lines.join('\n'));
  const b = analyze([lines[0], ...lines.slice(1).reverse()].join('\n'));
  assert.deepEqual(a.totals, b.totals);
  assert.deepEqual(a.issues.map(i => [i.id, i.exposure]), b.issues.map(i => [i.id, i.exposure]));
});
test('reordered columns, UTF-8 BOM, CRLF and quoted CSV are supported', () => {
  const headers = [...HEADERS].reverse(); const values = base.split(',').reverse();
  const input = '\uFEFF' + headers.join(',') + '\r\n' + values.map(v => `"${v}"`).join(',') + '\r\n';
  assert.equal(parseOrders(input)[0].gross, 10000);
});
for (const [label, input] of [
  ['duplicate order IDs', csv(base, base)],
  ['impossible date', csv(base.replace('2026-09-28', '2026-02-30'))],
  ['negative amount', csv(base.replace('100.00', '-1.00'))],
  ['excess precision', csv(base.replace('100.00', '100.001'))],
  ['excess refund', csv(base.replace('0.00,0.00', '99.00,0.00'))],
  ['excess discount', csv(base.replace('10.00', '110.00'))],
  ['non-integer promo count', csv(base.replace(',1,30', ',1.5,30'))],
  ['formula injection', csv(base.replace('ITEM', '=IMPORTXML'))],
  ['markup injection', csv(base.replace('ITEM', '<script>'))],
  ['handling with no refund', csv(base.replace(/0.00$/, '7.50'))],
  ['empty data', HEADERS.join(',')],
  ['duplicate columns', csv(base).replace('sku,category', 'sku,sku')],
  ['extra column', csv(base).replace('return_cost', 'return_cost,extra')],
  ['malformed quoting', csv(base.replace('ITEM', '"ITEM'))],
  ['oversize input', 'x'.repeat(2 * 1024 * 1024 + 1)],
] as const) test(`rejects ${label}`, () => assert.throws(() => parseOrders(input)));
test('fingerprint changes when bytes change', () => assert.notEqual(analyze(csv(base)).fingerprint, analyze(csv(base) + '\n').fingerprint));
test('case and punctuation-distinct SKUs keep unique stable return IDs and independent scenarios', () => {
  const skus = ['A.B', 'A-B', 'ABC', 'abc'];
  const rows = skus.flatMap((sku, entity) => Array.from({ length: 15 }, (_, i) => `R-${entity}-${i},${i < 10 ? '2026-09-01' : '2026-09-28'},${sku},Home,100.00,10.00,1,30.00,5.00,7.00,${i >= 12 ? '90.00,5.00' : '0.00,0.00'}`));
  const a = analyze(csv(...rows));
  const reversed = analyze(csv(...rows.toReversed()));
  assert.equal(a.issues.length, 4);
  assert.equal(new Set(a.issues.map(i => i.id)).size, 4);
  assert.deepEqual(a.issues.map(i => i.id).sort(), skus.map(returnIssueId).sort());
  assert.deepEqual(a.issues.map(i => [i.id, i.exposure]), reversed.issues.map(i => [i.id, i.exposure]));
  for (const issue of a.issues) assert.equal(simulate(a, { [issue.id]: 100 }).recovery, issue.exposure);
});
test('editable seller assumptions recompute exact cents, formulas and report metadata', () => {
  const a = analyze(createDemoCsv(), undefined, true, { discountCeilingPercent: 30, shippingSubsidyCents: 500 });
  assert.equal(a.issues.find(i => i.kind === 'discount')!.exposure, 29248);
  assert.equal(a.issues.find(i => i.kind === 'shipping')!.exposure, 17850);
  assert.ok(a.issues.find(i => i.kind === 'discount')!.formula.includes('30%'));
  assert.ok(a.issues.find(i => i.kind === 'shipping')!.formula.includes('$5.00'));
  assert.equal(a.assumptions.discountCeilingPercent, 30);
  assert.throws(() => analyze(createDemoCsv(), undefined, false, { discountCeilingPercent: 61, shippingSubsidyCents: 300 }));
});
