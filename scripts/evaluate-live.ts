import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { explain, remediate, settings } from '../server/nebius.js';
import { ContextSchema, research } from '../server/tavily.js';
import { decidePolicy } from '../shared/policy-decision.js';
import type { ResearchPacket } from '../shared/types.js';

// Intentionally separate from npm test/check. Actual calls require action-time approval.
const maxCalls = Number(process.env.EVAL_APPROVED_MAX_CALLS || 0), count = Number(process.env.EVAL_MAX_CASES || 12);
if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 36 || !Number.isInteger(count) || count < 1 || count > 12 || process.env.NEBIUS_ENABLE_LIVE !== 'true' || !process.env.NEBIUS_API_KEY || process.env.TAVILY_ENABLE_LIVE !== 'true' || !process.env.TAVILY_API_KEY) {
  console.error('Live evaluation not attempted. Both approved enabled credentials, EVAL_APPROVED_MAX_CALLS (1–36), and EVAL_MAX_CASES (1–12) are required.'); process.exitCode = 1;
} else {
  const data = z.object({ cases: z.array(z.object({ id: z.string(), group: z.string(), kind: z.enum(['discount', 'shipping']), platform: z.string(), carrier: z.string(), region: z.string(), origin: z.string(), expected: z.string(), nextCheck: z.string() })) }).parse(JSON.parse(await readFile('data/decision-cases.json', 'utf8')));
  const analysis = analyze(createDemoCsv(), 'Synthetic live-evaluation fixture', true);
  const results: unknown[] = [], cache = new Map<string, ResearchPacket>(); let attemptedCalls = 0;
  await mkdir('evidence', { recursive: true });
  for (const c of data.cases.slice(0, count)) {
    const issue = analysis.issues.find(i => i.kind === c.kind)!;
    const context = ContextSchema.parse({ platform: c.platform, carrier: c.carrier, region: c.region, discountOrigin: c.origin });
    const empty: ResearchPacket = { context, kind: c.kind, sources: [], status: 'no-results', mode: 'fixture', researchId: 'not-retrieved', query: '', checkedAt: null, note: 'Deterministic-only arm: no retrieval.' };
    let baseline = null, packet = cache.get(JSON.stringify([c.kind, context])) ?? null, augmented = null;
    if (attemptedCalls < maxCalls) { attemptedCalls++; baseline = await explain({ ...analysis, issues: [issue] }, true, settings(), fetch, context); }
    if (!packet && attemptedCalls < maxCalls) { attemptedCalls++; packet = { ...await research(c.kind, context, true), researchId: `live-eval-${c.id}` }; cache.set(JSON.stringify([c.kind, context]), packet); }
    const decision = packet ? decidePolicy(c.kind, packet) : decidePolicy(c.kind, empty);
    if (packet?.mode === 'live' && packet.status === 'ok' && !['hold', 'insufficient'].includes(decision.status) && attemptedCalls < maxCalls) { attemptedCalls++; augmented = await remediate(issue, packet, true); }
    results.push({ case: c.id, syntheticCondition: c.group, expectedFixtureDecision: c.expected, expectedCheck: c.nextCheck, deterministicWithoutRetrieval: decidePolicy(c.kind, empty), nvidiaWithoutRetrieval: baseline, tavily: packet, retrievalDecision: decision, nvidiaWithTavily: augmented, humanReview: 'PENDING: judge semantic support, applicability, prohibited claims and abstention. Live retrieval does not reproduce a malicious/conflicting synthetic passage automatically; those adversarial conditions remain fixture regression cases.' });
    await writeFile('evidence/live-evaluation.json', JSON.stringify({ status: 'OBSERVED_RUN_REQUIRES_HUMAN_REVIEW', executedAt: new Date().toISOString(), attemptedCalls, maximumApprovedCalls: maxCalls, datasetFingerprint: analysis.fingerprint, caveat: 'No automatic semantic-accuracy or causal-impact score. Baseline is a general brief; retrieval arm is a policy-remediation prompt. This is an exploratory comparison, not a controlled superiority claim.', results }, null, 2) + '\n');
    console.log(`Recorded case ${c.id}; attempted calls ${attemptedCalls}/${maxCalls}; Tavily ${packet?.mode ?? 'not called'}; NVIDIA baseline ${baseline?.mode ?? 'not called'}; augmented ${augmented?.mode ?? 'not called'}.`);
    if (attemptedCalls >= maxCalls) break;
  }
}
