import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { explain, remediate, settings } from '../server/nebius.js';
import { ContextSchema, research, tavilySettings } from '../server/tavily.js';
import { decidePolicy } from '../shared/policy-decision.js';
import type { ResearchPacket } from '../shared/types.js';
import { createRequestMeter, serializeEvaluationEvidence } from './lib/request-meter.js';

// Exploratory development runner, NOT the final benchmark. Never invoked by npm test/check.
// Actual calls require separately approved credentials and an explicit HTTP request budget.
const maxRequests = Number(process.env.EVAL_APPROVED_MAX_HTTP_REQUESTS || 0), count = Number(process.env.EVAL_MAX_CASES || 12);
if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 60 || !Number.isInteger(count) || count < 1 || count > 12 || process.env.NEBIUS_ENABLE_LIVE !== 'true' || !process.env.NEBIUS_API_KEY || process.env.TAVILY_ENABLE_LIVE !== 'true' || !process.env.TAVILY_API_KEY) {
  console.error('Live evaluation not attempted. Both approved enabled credentials, EVAL_APPROVED_MAX_HTTP_REQUESTS (1–60), and EVAL_MAX_CASES (1–12) are required.'); process.exitCode = 1;
} else {
  const data = z.object({ cases: z.array(z.object({ id: z.string(), group: z.string(), kind: z.enum(['discount', 'shipping']), platform: z.string(), carrier: z.string(), region: z.string(), origin: z.string(), expected: z.string(), nextCheck: z.string() })) }).parse(JSON.parse(await readFile('data/decision-cases.json', 'utf8')));
  const analysis = analyze(createDemoCsv(), 'Synthetic live-evaluation fixture', true);
  const results: unknown[] = [], cache = new Map<string, ResearchPacket>();
  const meter = createRequestMeter(maxRequests);
  const attemptedOperations = { baseline: 0, search: 0, remediation: 0 };
  await mkdir('evidence', { recursive: true });
  for (const c of data.cases.slice(0, count)) {
    const issue = analysis.issues.find(i => i.kind === c.kind)!;
    const context = ContextSchema.parse({ platform: c.platform, carrier: c.carrier, region: c.region, discountOrigin: c.origin });
    const empty: ResearchPacket = { context, kind: c.kind, sources: [], status: 'no-results', mode: 'fixture', researchId: 'not-retrieved', query: '', checkedAt: null, note: 'Deterministic-only arm: no retrieval.' };
    let baseline = null, packet = cache.get(JSON.stringify([c.kind, context])) ?? null, augmented = null;
    if (meter.remaining() >= 2) { attemptedOperations.baseline++; baseline = await explain({ ...analysis, issues: [issue] }, true, settings(), meter.request, context); }
    if (!packet && meter.remaining() >= 1) { attemptedOperations.search++; packet = { ...await research(c.kind, context, true, tavilySettings(), meter.request), researchId: `live-eval-${c.id}` }; cache.set(JSON.stringify([c.kind, context]), packet); }
    const decision = packet ? decidePolicy(c.kind, packet) : decidePolicy(c.kind, empty);
    if (packet?.mode === 'live' && packet.status === 'ok' && !['hold', 'insufficient'].includes(decision.status) && meter.remaining() >= 2) { attemptedOperations.remediation++; augmented = await remediate(issue, packet, true, settings(), meter.request); }
    results.push({ case: c.id, syntheticCondition: c.group, expectedFixtureDecision: c.expected, expectedCheck: c.nextCheck, deterministicWithoutRetrieval: decidePolicy(c.kind, empty), nvidiaWithoutRetrieval: baseline, tavily: packet, retrievalDecision: decision, nvidiaWithTavily: augmented, humanReview: 'PENDING: judge semantic support, applicability, prohibited claims and abstention. Live retrieval does not reproduce a malicious/conflicting synthetic passage automatically; those adversarial conditions remain fixture regression cases.' });
    await writeFile('evidence/live-evaluation.json', serializeEvaluationEvidence({ schemaVersion: 2, status: 'EXPLORATORY_OBSERVATIONS_REQUIRING_HUMAN_REVIEW_NOT_FINAL_BENCHMARK', executedAt: new Date().toISOString(), attemptedOperations, http: meter.snapshot(), datasetFingerprint: analysis.fingerprint, caveat: 'No automatic semantic-accuracy or causal-impact score. Baseline is a general brief; retrieval arm is a policy-remediation prompt. This is an exploratory comparison, not a controlled superiority claim.', checkpointLimitation: 'Evidence is saved after each completed case. An interrupted case can have HTTP attempts or unknown in-flight outcomes absent from the last saved checkpoint; this artifact is not a durable provider-usage ledger.', results }));
    console.log(`Recorded case ${c.id}; HTTP attempts ${meter.snapshot().attemptedHttpRequests}/${maxRequests}; Tavily ${packet?.mode ?? 'not called'}; NVIDIA baseline ${baseline?.mode ?? 'not called'}; augmented ${augmented?.mode ?? 'not called'}.`);
    if (meter.remaining() === 0) break;
  }
}
