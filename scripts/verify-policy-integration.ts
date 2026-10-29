import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serializeEvaluationEvidence } from './lib/request-meter.js';
import { verifyPolicyIntegration } from './lib/verify-policy-integration.js';

// Explicit CLI only, never imported by tests or the app. The npm command loads
// ignored local environment files only when an operator invokes this entry.
const args = process.argv.slice(2);
const approved = args.length === 2 && args.includes('--live') && args.includes('--max-http-requests=3');
const tavily = { enabled: process.env.TAVILY_ENABLE_LIVE === 'true', key: process.env.TAVILY_API_KEY };
const nebius = { enabled: process.env.NEBIUS_ENABLE_LIVE === 'true', key: process.env.NEBIUS_API_KEY, model: process.env.NEBIUS_MODEL };
if (!approved || !tavily.enabled || !tavily.key || !nebius.enabled || !nebius.key || !nebius.model || nebius.model.length > 512 || !/^nvidia\/[a-zA-Z0-9._/-]+$/i.test(nebius.model)) {
  console.error('No integration requests attempted. Requires --live --max-http-requests=3, both provider enable flags and approved keys, and an explicit NVIDIA NEBIUS_MODEL.');
  process.exitCode = 1;
} else {
  const runId = `policy-integration-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const directory = resolve('evidence', runId);
  try {
    await mkdir(resolve('evidence'), { recursive: true });
    // Unique directory plus exclusive checkpoint writes preserve every older run.
    await mkdir(directory);
    const report = await verifyPolicyIntegration({
      runId, approvedLive: approved, tavily, nebius, request: fetch,
      checkpoint: async report => {
        const name = `${String(report.checkpointSequence).padStart(3, '0')}-${report.stage}.json`;
        await writeFile(resolve(directory, name), serializeEvaluationEvidence(report), { flag: 'wx', mode: 0o600 });
      },
    });
    console.log(`Integration report: ${directory}`);
    console.log(`HTTP attempts ${report.http.attemptedHttpRequests}/3; validated live model success ${report.validatedLiveModelSuccess ? 'yes' : 'no'}; human policy-fidelity review pending. This is not a final benchmark.`);
    if (!report.validatedLiveModelSuccess) process.exitCode = 1;
  } catch {
    console.error(`Integration verifier stopped. Inspect checkpoints in ${directory}; reserved in-flight calls may have consumed usage. No automatic retry was made.`);
    process.exitCode = 1;
  }
}
