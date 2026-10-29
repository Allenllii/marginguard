import { mkdir, writeFile } from 'node:fs/promises';
import { analyze } from '../server/analysis.js';
import { createDemoCsv } from '../server/demo.js';
import { explain } from '../server/nebius.js';

// Explicit operator command only. Uses synthetic aggregates. Never prints or stores the API key.
if (process.env.NEBIUS_ENABLE_LIVE !== 'true' || !process.env.NEBIUS_API_KEY) {
  console.error('Live proof not attempted. Approved transient server credentials and NEBIUS_ENABLE_LIVE=true are required.');
  process.exitCode = 1;
} else {
  const analysis = analyze(createDemoCsv(), 'Synthetic live-verification fixture', true);
  const result = await explain(analysis, true);
  if (result.mode !== 'live' || !result.proof) { console.error(`No live proof recorded: ${result.fallbackReason ?? 'invalid response'}`); process.exitCode = 1; }
  else {
    await mkdir('evidence', { recursive: true });
    await writeFile('evidence/live-proof.json', JSON.stringify({ scope: 'Actual Nebius request using synthetic aggregate findings; model explanation only, no savings or real-world accuracy claim.', datasetFingerprint: analysis.fingerprint, explanation: result }, null, 2) + '\n');
    console.log(`Genuine NVIDIA/Nebius response validated; model ${result.model}; request ${result.proof.requestId ?? 'ID not returned'}; ${result.proof.latencyMs} ms observed. Saved evidence/live-proof.json.`);
  }
}
