import { mkdir, writeFile } from 'node:fs/promises';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { remediate } from '../server/nebius.js';
import { decidePolicy } from '../shared/policy-decision.js';
import { research } from '../server/tavily.js';
import type { ResearchPacket } from '../shared/types.js';

const searchOnly = process.argv.includes('--search-only');
if (process.env.TAVILY_ENABLE_LIVE !== 'true' || !process.env.TAVILY_API_KEY || (!searchOnly && (process.env.NEBIUS_ENABLE_LIVE !== 'true' || !process.env.NEBIUS_API_KEY))) {
  console.error('No live request attempted. Approved transient credentials and explicit provider enable flags are required.');
  process.exitCode = 1;
} else {
  const analysis = analyze(createDemoCsv(), 'Synthetic policy verification fixture', true);
  const issue = analysis.issues.find(i => i.kind === 'discount')!;
  const packet: ResearchPacket = { ...await research('discount', { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' }, true), researchId: 'operator-live-verification' };
  const decision = decidePolicy(issue.kind, packet);
  if (packet.mode !== 'live' || !packet.proof) { console.error(`No live search proof recorded: ${packet.note}`); process.exitCode = 1; }
  else {
    await mkdir('evidence', { recursive: true });
    await writeFile('evidence/tavily-live-proof.json', JSON.stringify({ scope: 'Actual Tavily call; no private CSV or product identifiers in query. Decision routing is conservative and needs human policy-fidelity review.', packet, decision }, null, 2) + '\n');
    console.log(`Actual Tavily response recorded; status ${packet.status}; sources ${packet.sources.length}; request ${packet.proof.requestId ?? 'not returned'}.`);
    if (!searchOnly && packet.status === 'ok' && ['review', 'contradicted'].includes(decision.status)) {
      const result = await remediate(issue, packet, true);
      if (result.mode !== 'live' || !result.proof) { console.error(`No live model proof recorded: ${result.fallbackReason}`); process.exitCode = 1; }
      else {
        await writeFile('evidence/policy-live-proof.json', JSON.stringify({ scope: 'Actual Tavily search followed by actual NVIDIA/Nebius cited remediation, synthetic aggregate issue data only.', datasetFingerprint: analysis.fingerprint, packet, remediation: result }, null, 2) + '\n');
        console.log(`Genuine policy workflow validated; NVIDIA model ${result.model}; request ${result.proof.requestId ?? 'not returned'}.`);
      }
    } else if (!searchOnly) { console.error('No relevant official sources: model not called.'); process.exitCode = 1; }
  }
}
