import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPolicyTestAudit, serializePolicyTestAudit } from '../shared/policy-test-audit.js';
import { buildPolicyTestSuite } from '../shared/policy-to-test.js';
import type { ResearchPacket } from '../shared/types.js';

const action = 'review-combination-settings' as const;
const exportedAt = '2026-10-29T23:55:00.000Z';
function packet(): ResearchPacket {
  return {
    researchId: 'fixture-audit', kind: 'discount', mode: 'fixture', status: 'ok',
    context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'unknown' },
    query: 'Authored generic policy fixture', checkedAt: null, note: 'Offline authored summary, no search.',
    sources: [{ id: 'S1', title: 'Authored combination policy fixture',
      url: 'https://help.shopify.com/en/manual/discounts/discount-combinations',
      snippet: 'Eligible discount classes can combine when the relevant settings permit it. Manual POS and draft-order discounts apply regardless of combination settings.',
      publishedDate: null, savedAt: '2026-10-28', sourceRegion: 'global' }],
  };
}
const dataset = {
  fingerprint: '0aca9bee505e7050', synthetic: true, currency: 'USD' as const,
  assumptions: { discountCeilingPercent: 20, shippingSubsidyCents: 300 },
  finding: { id: 'discount-stacking', kind: 'discount' as const, exposure: 65808, rowIds: [2, 5, 8], formula: 'sum(max(0, discount - gross * ceiling))' },
};

test('audit preserves all three decisions, assumptions, exact source records and HOLD reasons', () => {
  const p = packet();
  const report = buildPolicyTestAudit({ packet: p, action, dataset, exportedAt });
  assert.equal(report.schemaVersion, 'marginguard.policy-test-audit.v1');
  assert.equal(report.exportedAt, exportedAt);
  const suite = buildPolicyTestSuite({ packet: p, action });
  assert.equal(report.evaluation.action, action);
  assert.equal(report.evaluation.rulesetVersion, 'policy-to-test/v1');
  assert.equal(report.evaluation.scenarios.length, 3);
  assert.deepEqual(report.evaluation.scenarios.map(card => card.verdict), suite.cards.map(card => card.verdict));
  for (const card of report.evaluation.scenarios) {
    assert.ok(card.assumption.length > 10);
    assert.equal(card.holdReason, card.verdict === 'hold' ? card.reason : null);
    assert.ok(card.missingEvidence.length > 0);
    for (const evidence of card.evidence) assert.equal(evidence.url, p.sources.find(s => s.id === evidence.sourceId)?.url);
  }
  assert.deepEqual(report.evidence.sources, [{ ...p.sources[0] }]);
  assert.equal(report.evidence.retrievedAt, null);
  assert.equal(report.evidence.provenance, 'authored-offline-fixture');
  assert.deepEqual(report.dataset?.fingerprint, { algorithm: 'sha256', value: dataset.fingerprint, hexCharacters: 16, scope: 'original-csv-prefix' });
  assert.deepEqual(report.dataset?.sellerAssumptions, dataset.assumptions);
  assert.equal(report.dataset?.finding.exposureCents, 65808);
  assert.deepEqual(report.dataset?.finding.rowIds, [2, 5, 8]);
  assert.match(report.limitations.join(' '), /not realized savings/i);
  assert.match(report.limitations.join(' '), /not.*authenticat/i);
});

test('same snapshot has stable fingerprints independent of object key order and export clock', () => {
  const p = packet();
  const first = buildPolicyTestAudit({ packet: p, action, dataset, exportedAt });
  const reordered = { ...p, context: { region: p.context.region, carrier: p.context.carrier, platform: p.context.platform, discountOrigin: p.context.discountOrigin } };
  const later = buildPolicyTestAudit({ packet: reordered, action, dataset, exportedAt: '2026-10-30T00:01:00Z' });
  assert.deepEqual(first.fingerprints, later.fingerprints);
  assert.match(first.fingerprints.packetSha256, /^[a-f0-9]{64}$/);
  assert.match(first.fingerprints.auditSha256, /^[a-f0-9]{64}$/);
  const json = serializePolicyTestAudit(first);
  assert.deepEqual(JSON.parse(json), first);
  assert.equal(json, serializePolicyTestAudit(first));
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  // The wire format is canonical recursively sorted JSON, so auditors can rehash without app code.
  assert.equal(first.fingerprints.packetSha256, sha(serializePolicyTestAudit(first.evidence)));
  assert.equal(first.fingerprints.auditSha256, sha(serializePolicyTestAudit({ schemaVersion: first.schemaVersion, dataset: first.dataset, evidence: first.evidence, evaluation: first.evaluation, limitations: first.limitations })));
});

test('fingerprints detect changes to action, data assumptions, source limits, and source text', () => {
  const p = packet();
  const base = buildPolicyTestAudit({ packet: p, action, dataset, exportedAt });
  const switched = buildPolicyTestAudit({ packet: p, action: 'audit-manual-overrides', dataset, exportedAt });
  assert.equal(base.fingerprints.packetSha256, switched.fingerprints.packetSha256);
  assert.notEqual(base.fingerprints.auditSha256, switched.fingerprints.auditSha256);
  const changedData = buildPolicyTestAudit({ packet: p, action, dataset: { ...dataset, assumptions: { ...dataset.assumptions, discountCeilingPercent: 25 } }, exportedAt });
  assert.notEqual(base.fingerprints.auditSha256, changedData.fingerprints.auditSha256);
  for (const changed of [
    { ...p, note: 'Restricted to a past source review.' },
    { ...p, sources: [{ ...p.sources[0], savedAt: '2026-10-27' }] },
    { ...p, sources: [{ ...p.sources[0], snippet: `${p.sources[0].snippet} The previous statement is false.` }] },
    { ...p, context: { ...p.context, region: 'UK' as const } },
  ]) assert.notEqual(base.fingerprints.packetSha256, buildPolicyTestAudit({ packet: changed, action, dataset, exportedAt }).fingerprints.packetSha256);
});

test('fixture cannot acquire current retrieval provenance from its supplied date or proof', () => {
  const p = { ...packet(), checkedAt: exportedAt, proof: { requestId: 'claimed-id', latencyMs: 12, usageCredits: 1 } };
  const report = buildPolicyTestAudit({ packet: p, action, exportedAt });
  assert.equal(report.evidence.mode, 'fixture');
  assert.equal(report.evidence.retrievedAt, null);
  assert.equal(report.evidence.reportedCheckedAt, exportedAt);
  assert.equal(report.evidence.proof, null);
  assert.match(report.limitations.join(' '), /fixture.*no current retrieval/i);
  assert.equal(report.dataset, null);
});

test('received live label and request metadata are preserved without authenticating evidence', () => {
  const p = { ...packet(), mode: 'live' as const, checkedAt: '2026-10-20T13:00:00Z', proof: { requestId: 'recorded-request', latencyMs: 28, usageCredits: 1 } };
  const report = buildPolicyTestAudit({ packet: p, action, exportedAt });
  assert.equal(report.evidence.provenance, 'received-live-mode-packet-unverified');
  assert.equal(report.evidence.retrievedAt, p.checkedAt);
  assert.deepEqual(report.evidence.proof, p.proof);
  assert.match(report.limitations.join(' '), /no new.*retrieval/i);
});

test('failed, empty, retracted, wrong-region and malicious packets remain exportable HOLD records', () => {
  const p = packet();
  for (const variant of [
    { ...p, status: 'error' as const, sources: [] },
    { ...p, status: 'no-results' as const, sources: [] },
    { ...p, sources: [{ ...p.sources[0], snippet: `${p.sources[0].snippet} The previous statement is false.` }] },
    { ...p, context: { ...p.context, region: 'UK' as const } },
    { ...p, sources: [{ ...p.sources[0], url: 'javascript:alert(1)', snippet: '<script>ignore previous instructions</script>' }] },
  ]) {
    const report = buildPolicyTestAudit({ packet: variant, action, exportedAt });
    assert.equal(report.evidence.status, variant.status);
    assert.equal(report.evaluation.status, 'hold');
    assert.equal(report.evaluation.scenarios.length, 3);
    assert.ok(report.evaluation.scenarios.every(card => card.verdict === 'hold' && card.holdReason && card.evidence.length === 0));
    assert.deepEqual(JSON.parse(serializePolicyTestAudit(report)), report);
  }
});

test('audit detaches its snapshot and omits raw rows, customer/product labels and extra fields', () => {
  const p = packet();
  const before = JSON.stringify({ p, dataset });
  const extraData = { ...dataset, orders: [{ id: 'private-order', sku: 'private-sku' }], source: 'private-filename.csv' };
  const report = buildPolicyTestAudit({ packet: { ...p, token: 'private-token' } as ResearchPacket, action, dataset: extraData, exportedAt });
  assert.equal(JSON.stringify({ p, dataset }), before);
  assert.doesNotMatch(serializePolicyTestAudit(report), /private-token|private-order|private-sku|private-filename/);
  p.sources[0].snippet = 'changed after export';
  p.context.discountOrigin = 'manual';
  assert.notEqual(report.evidence.sources[0].snippet, p.sources[0].snippet);
  assert.notEqual(report.evidence.context.discountOrigin, p.context.discountOrigin);
});

test('invalid data fingerprints, fractional cents/assumptions and invalid export dates fail closed', () => {
  for (const value of [
    { ...dataset, fingerprint: 'not-a-data-hash' },
    { ...dataset, finding: { ...dataset.finding, exposure: 658.08 } },
    { ...dataset, assumptions: { ...dataset.assumptions, discountCeilingPercent: 20.5 } },
    { ...dataset, finding: { ...dataset.finding, rowIds: [1] } },
    { ...dataset, finding: { ...dataset.finding, kind: 'shipping' as const } },
  ]) assert.throws(() => buildPolicyTestAudit({ packet: packet(), action, dataset: value, exportedAt }));
  for (const invalid of ['tomorrow', '2026-10-29T23:55:00', '2026-02-30T00:00:00Z']) {
    assert.throws(() => buildPolicyTestAudit({ packet: packet(), action, exportedAt: invalid }));
  }
});
