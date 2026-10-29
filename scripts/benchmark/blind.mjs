import { createHash, createHmac } from 'node:crypto';

const ARMS = ['A', 'B', 'C'];
const DIMENSIONS = ['support', 'applicability', 'abstention', 'prohibited'];
const STATUSES = ['review', 'hold', 'insufficient', 'contradicted'];
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,96}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function neutralOutput(output) {
  if (output === null) return null;
  if (!output || !STATUSES.includes(output.status) || !Array.isArray(output.sourceIds)
    || output.sourceIds.length > 50 || output.sourceIds.some(id => typeof id !== 'string' || !id || id.length > 256)) throw new Error('Invalid blind output');
  const sources = [...new Set(output.sourceIds)];
  const citations = new Map(sources.map((id, index) => [id, `CIT${index + 1}`]));
  const pattern = sources.length ? new RegExp(sources.slice().sort((a, b) => b.length - a.length).map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
  const redact = value => {
    if (typeof value !== 'string' || value.length > 12000) throw new Error('Invalid blind output text');
    // One escaped, longest-first pass avoids ID substitution cascades.
    const text = pattern ? value.replace(pattern, id => citations.get(id)) : value;
    return text.replace(/\b(?:tavily|nebius|tokenfactory)\b/gi, '[provider redacted]');
  };
  return {
    status: output.status,
    rationale: redact(output.rationale),
    nextCheck: redact(output.nextCheck),
    disconfirmingEvidence: redact(output.disconfirmingEvidence),
    sourceIds: sources.map((_, i) => `CIT${i + 1}`),
  };
}

/** Build a labels-blind packet. Keep seed and mapping away from raters. */
export function createBlindPacket(rows, { seed } = {}) {
  if (typeof seed !== 'string' || seed.length < 16) throw new Error('A private seed of at least 16 characters is required');
  if (!Array.isArray(rows) || !rows.length) throw new Error('Blind rows are required');
  const byCase = new Map();
  for (const row of rows) {
    if (!row || !safeId(row.caseId) || !ARMS.includes(row.arm)) throw new Error('Invalid case or arm');
    if (!byCase.has(row.caseId)) byCase.set(row.caseId, new Map());
    const arms = byCase.get(row.caseId);
    if (arms.has(row.arm)) throw new Error('Duplicate case/arm');
    arms.set(row.arm, neutralOutput(row.output));
  }
  const items = [], entries = [];
  const key = value => createHmac('sha256', seed).update(value).digest('hex');
  for (const caseId of [...byCase.keys()].sort()) {
    const arms = byCase.get(caseId);
    if (arms.size !== 3) throw new Error('Every case needs A, B and C rows; use null output for missing results');
    const shuffled = ARMS.map(arm => ({ arm, rank: key(`order:${caseId}:${arm}`) })).sort((a, b) => a.rank.localeCompare(b.rank));
    for (const { arm } of shuffled) {
      const itemId = `J${key(`item:${caseId}:${arm}`).slice(0, 24)}`;
      const output = arms.get(arm);
      items.push({ itemId, caseId, output });
      entries.push({ itemId, caseId, arm, available: output !== null });
    }
  }
  const packet = { schemaVersion: 1, items };
  return { packet, mapping: { schemaVersion: 1, packetHash: digest(packet), entries } };
}

/** Summarize independent human ratings without inventing a consensus or dropping failures. */
export function scoreBlindReviews(mapping, reviews, { adjudications = [] } = {}) {
  if (!mapping || mapping.schemaVersion !== 1 || !Array.isArray(mapping.entries) || !mapping.entries.length
    || !Array.isArray(reviews) || !Array.isArray(adjudications)) throw new Error('Invalid mapping or reviews');
  const entries = new Map();
  const pairs = new Set();
  for (const entry of mapping.entries) {
    if (!entry || !safeId(entry.itemId) || !safeId(entry.caseId) || !ARMS.includes(entry.arm)
      || typeof entry.available !== 'boolean' || entries.has(entry.itemId)
      || pairs.has(`${entry.caseId}:${entry.arm}`)) throw new Error('Invalid mapping entry');
    entries.set(entry.itemId, { ...entry, ratings: [] });
    pairs.add(`${entry.caseId}:${entry.arm}`);
  }
  const cases = new Set(mapping.entries.map(entry => entry.caseId));
  if ([...cases].some(caseId => ARMS.some(arm => !pairs.has(`${caseId}:${arm}`)))) throw new Error('Incomplete arm denominator');
  const seen = new Set();
  for (const review of reviews) {
    if (!review || !entries.has(review.itemId) || !safeId(review.raterId)
      || DIMENSIONS.some(dimension => ![0, 1].includes(review[dimension]))) throw new Error('Invalid review');
    const reviewKey = `${review.itemId}:${review.raterId}`;
    if (seen.has(reviewKey)) throw new Error('Duplicate rater/item review');
    seen.add(reviewKey);
    entries.get(review.itemId).ratings.push(Object.fromEntries(['raterId', ...DIMENSIONS].map(field => [field, review[field]])));
  }
  const decisions = new Map();
  for (const decision of adjudications) {
    const entry = decision && entries.get(decision.itemId);
    if (!entry || !safeId(decision.raterId) || DIMENSIONS.some(dimension => ![0, 1].includes(decision[dimension]))
      || decisions.has(decision.itemId) || entry.ratings.some(rating => rating.raterId === decision.raterId)) throw new Error('Invalid independent adjudication');
    const disputed = entry.ratings.length >= 2 && DIMENSIONS.some(dimension => new Set(entry.ratings.map(rating => rating[dimension])).size > 1);
    if (!entry.available || !disputed) throw new Error('Adjudication requires two raters and a disagreement');
    decisions.set(decision.itemId, decision);
  }
  const items = [...entries.values()].map(entry => {
    const complete = entry.available && entry.ratings.length >= 2;
    const disagreements = complete ? DIMENSIONS.filter(dimension => new Set(entry.ratings.map(rating => rating[dimension])).size > 1) : [];
    const decision = decisions.get(entry.itemId);
    return { itemId: entry.itemId, caseId: entry.caseId, arm: entry.arm, available: entry.available,
      raterCount: entry.ratings.length, status: !entry.available ? 'missing-output' : !complete ? 'pending-review' : decision ? 'adjudicated' : disagreements.length ? 'pending-adjudication' : 'agreed',
      disagreements, scores: decision ? Object.fromEntries(DIMENSIONS.map(dimension => [dimension, decision[dimension]]))
        : complete && !disagreements.length ? Object.fromEntries(DIMENSIONS.map(dimension => [dimension, entry.ratings[0][dimension]])) : null };
  });
  const arms = Object.fromEntries(ARMS.map(arm => {
    const subset = items.filter(item => item.arm === arm), agreed = subset.filter(item => ['agreed', 'adjudicated'].includes(item.status));
    return [arm, { denominator: subset.length, available: subset.filter(item => item.available).length,
      resolved: agreed.length, adjudicated: subset.filter(item => item.status === 'adjudicated').length, pendingReview: subset.filter(item => item.status === 'pending-review').length,
      pendingAdjudication: subset.filter(item => item.status === 'pending-adjudication').length,
      missingOutput: subset.filter(item => !item.available).length,
      passed: Object.fromEntries(DIMENSIONS.map(dimension => [dimension, agreed.filter(item => item.scores[dimension] === 1).length])),
      // A provisional success fraction uses the complete planned denominator. Unknowns are separately visible.
      provisionalPassFraction: Object.fromEntries(DIMENSIONS.map(dimension => [dimension, agreed.filter(item => item.scores[dimension] === 1).length / subset.length])),
    }];
  }));
  return { schemaVersion: 1, status: items.every(item => ['agreed', 'adjudicated'].includes(item.status)) ? 'complete' : 'incomplete',
    caseCount: cases.size, itemCount: items.length, arms, items,
    interpretation: 'All dimensions use 1 = compliant. Fractions are resolved passes / full arm denominator; missing reviews, disputed ratings and missing outputs remain unresolved. No superiority claim or automatic adjudication.' };
}
