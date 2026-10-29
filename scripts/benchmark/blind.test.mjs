import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlindPacket, scoreBlindReviews } from './blind.mjs';

const seed = 'private-test-seed-never-shared-with-raters';
const output = { status: 'hold', rationale: 'Tavily passage tavily-source-01 needs checking.', nextCheck: 'Inspect tavily-source-01.', disconfirmingEvidence: 'Nebius is not evidence.', sourceIds: ['tavily-source-01'], rawProviderResponse: 'SECRET', gold: 'ANSWER' };
const rows = ['A', 'B', 'C'].map(arm => ({ caseId: 'H01', arm, output, gold: 'DO NOT EXPORT', provider: 'nebius' }));
const rating = (itemId, raterId, changes = {}) => ({ itemId, raterId, support: 1, applicability: 1, abstention: 1, prohibited: 1, ...changes });

test('blind packet is deterministic, allowlisted, provider-neutral, and does not mutate outputs', () => {
  const first = createBlindPacket(rows, { seed });
  assert.deepEqual(first, createBlindPacket(rows, { seed }));
  assert.notDeepEqual(first, createBlindPacket(rows, { seed: `${seed}-other` }));
  assert.equal(first.packet.items.length, 3);
  const serialized = JSON.stringify(first.packet);
  for (const secret of ['SECRET', 'ANSWER', 'DO NOT EXPORT', 'tavily', 'Nebius', 'rawProviderResponse', '"arm"', '"provider"']) assert.equal(serialized.includes(secret), false, secret);
  assert.deepEqual(first.packet.items[0].output.sourceIds, ['CIT1']);
  assert.match(first.packet.items[0].output.rationale, /CIT1/);
  assert.equal(output.sourceIds[0], 'tavily-source-01');
  assert.deepEqual(first.mapping.entries.map(entry => entry.arm).sort(), ['A', 'B', 'C']);
});

test('blind exports preserve missing outputs and require the complete planned denominator', () => {
  assert.throws(() => createBlindPacket(rows.slice(0, 2), { seed }), /Every case/);
  assert.throws(() => createBlindPacket([...rows, rows[0]], { seed }), /Duplicate/);
  assert.throws(() => createBlindPacket(rows, { seed: 'short' }), /seed/);
  const { packet, mapping } = createBlindPacket(rows.map(row => ({ ...row, output: row.arm === 'B' ? null : row.output })), { seed });
  assert.equal(packet.items.filter(item => item.output === null).length, 1);
  const report = scoreBlindReviews(mapping, []);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.arms.B.denominator, 1);
  assert.equal(report.arms.B.missingOutput, 1);
  assert.equal(report.arms.A.pendingReview, 1);
});

test('citation neutralization escapes literal IDs and never cascades replacements', () => {
  const unusual = { ...output, rationale: 'Use [S.1] and CIT1; do not replace Sx1.', sourceIds: ['[S.1]', 'CIT1'] };
  const { packet } = createBlindPacket(rows.map(row => ({ ...row, output: unusual })), { seed });
  assert.equal(packet.items[0].output.rationale, 'Use CIT1 and CIT2; do not replace Sx1.');
});

test('two distinct independent raters and adjudication are mandatory', () => {
  const { mapping } = createBlindPacket(rows, { seed });
  const reviews = mapping.entries.flatMap(entry => [rating(entry.itemId, 'human-1'), rating(entry.itemId, 'human-2')]);
  assert.equal(scoreBlindReviews(mapping, reviews).status, 'complete');
  assert.throws(() => scoreBlindReviews(mapping, [...reviews, reviews[0]]), /Duplicate rater/);
  const disputed = reviews.map((review, index) => index === 1 ? { ...review, support: 0 } : review);
  const report = scoreBlindReviews(mapping, disputed);
  assert.equal(report.status, 'incomplete');
  assert.equal(report.items[0].status, 'pending-adjudication');
  assert.deepEqual(report.items[0].disagreements, ['support']);
  assert.equal(report.items[0].scores, null);
  const decision = rating(mapping.entries[0].itemId, 'human-adjudicator', { support: 0 });
  const resolved = scoreBlindReviews(mapping, disputed, { adjudications: [decision] });
  assert.equal(resolved.status, 'complete');
  assert.equal(resolved.items[0].status, 'adjudicated');
  assert.equal(resolved.items[0].scores.support, 0);
  assert.throws(() => scoreBlindReviews(mapping, disputed, { adjudications: [{ ...decision, raterId: 'human-1' }] }), /independent/);
  assert.throws(() => scoreBlindReviews(mapping, reviews, { adjudications: [decision] }), /disagreement/);
  const oneRater = reviews.filter(review => review.raterId === 'human-1');
  assert.ok(scoreBlindReviews(mapping, oneRater).items.every(item => item.status === 'pending-review'));
});

test('ratings cannot add unknown items, alter denominator, or smuggle arbitrary scores', () => {
  const { mapping } = createBlindPacket(rows, { seed });
  assert.throws(() => scoreBlindReviews(mapping, [rating('unknown', 'human')]), /Invalid review/);
  assert.throws(() => scoreBlindReviews(mapping, [rating(mapping.entries[0].itemId, 'human', { support: 0.5 })]), /Invalid review/);
  assert.throws(() => scoreBlindReviews({ ...mapping, entries: mapping.entries.slice(0, 2) }, []), /denominator/);
});
