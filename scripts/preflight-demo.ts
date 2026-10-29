import { PREFLIGHT_FIXTURE, runPreflight } from '../shared/preflight.js';

// A single deterministic synthetic example; no provider, checkout or benchmark.
const fixture = runPreflight(PREFLIGHT_FIXTURE);
const candidateInput = structuredClone(PREFLIGHT_FIXTURE);
candidateInput.rules = candidateInput.rules.filter(rule => rule.id !== 'ORDER20');
const candidate = runPreflight(candidateInput);

console.log(JSON.stringify({
  label: 'Synthetic offline Promo Preflight example; no checkout execution or realized savings',
  baselineContributionCents: fixture.baseline.contributionCents,
  original: {
    status: fixture.status,
    worstContributionCents: fixture.worst.contributionCents,
    remainingMerchandiseCents: fixture.fullStackTrace.steps.map(step => step.remainingMerchandiseCents),
    searchSpace: fixture.searchSpace,
    holdReasons: fixture.holdReasons,
  },
  sellerEditedCandidate: {
    omittedRule: 'ORDER20',
    status: candidate.status,
    worstContributionCents: candidate.worst.contributionCents,
    holdReasons: candidate.holdReasons,
  },
}, null, 2));
