import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { analyze, HEADERS } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';

const truth = JSON.parse(await readFile('data/ground-truth.json', 'utf8')) as { fingerprint: string; orders: number; totals_cents: Record<'gross' | 'revenue' | 'contribution' | 'opportunity', number>; issues: { id: string; exposure_cents: number; csv_rows: number[] }[] };
const csv = await readFile('data/northstar-demo.csv', 'utf8');
assert.equal(csv, createDemoCsv(), 'checked-in fixture must match generator bytes');
const result = analyze(csv);
assert.equal(result.fingerprint, truth.fingerprint);
assert.equal(result.orders.length, truth.orders);
for (const key of ['gross', 'revenue', 'contribution', 'opportunity'] as const) assert.equal(result.totals[key], truth.totals_cents[key], key);
assert.deepEqual(result.issues.map(i => i.id).sort(), truth.issues.map(i => i.id).sort());
for (const expected of truth.issues) {
  const issue = result.issues.find(i => i.id === expected.id)!;
  assert.equal(issue.exposure, expected.exposure_cents, expected.id);
  assert.deepEqual(issue.rowIds, expected.csv_rows, `${expected.id}: exact row evidence`);
}
const cleanCsv = [HEADERS.join(','), ...result.orders.map(r => [r.id, r.date, r.sku, r.category, (r.gross / 100).toFixed(2), (r.gross / 1000).toFixed(2), 1, (r.cogs / 100).toFixed(2), '4.90', '7.00', '0.00', '0.00'].join(','))].join('\n') + '\n';
assert.equal(analyze(cleanCsv).issues.length, 0, 'normalized clean control must have no findings');
await writeFile('data/northstar-clean-control.csv', cleanCsv);
const report = {
  executedAt: new Date().toISOString(), scope: 'Two synthetic fixtures; deterministic rules only. No live inference and no claims about real-world accuracy.',
  plantedFixture: { orders: 504, expectedIssues: 3, detectedIssues: result.issues.length, exactExposureChecks: '3/3', exactEvidenceRowChecks: '3/3', evidenceRows: truth.issues.reduce((s, i) => s + i.csv_rows.length, 0) },
  cleanControl: { orders: 504, detectedIssues: 0 }, reproducibleFingerprint: result.fingerprint, status: 'PASS',
};
await mkdir('evidence', { recursive: true });
await writeFile('evidence/evaluation.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
