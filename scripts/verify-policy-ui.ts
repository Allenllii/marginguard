import express from 'express';
import { chromium, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { FRONTEND_DIRECTORY } from '../shared/build-paths.js';
import { createRequestMeter, serializeEvaluationEvidence } from './lib/request-meter.js';
import { diagnosePolicyResponse } from './lib/verify-policy-integration.js';
import { decidePolicy } from '../shared/policy-decision.js';
import type { Remediation, ResearchPacket } from '../shared/types.js';

// Operator-only integration journey, deliberately excluded from offline tests.
// It owns one loopback-only backend and browser and closes both in finally.
const args = process.argv.slice(2);
const approved = args.length === 2 && args.includes('--live') && args.includes('--max-http-requests=3');
const keys = [process.env.TAVILY_API_KEY, process.env.NEBIUS_API_KEY].filter((value): value is string => Boolean(value));
if (!approved || keys.length !== 2 || process.env.TAVILY_ENABLE_LIVE !== 'true' || process.env.NEBIUS_ENABLE_LIVE !== 'true' || !/^nvidia\/[a-zA-Z0-9._/-]+$/iu.test(process.env.NEBIUS_MODEL ?? '')) {
  console.error('No live UI requests attempted. Requires --live --max-http-requests=3, both approved enabled local providers and an explicit NVIDIA model.');
  process.exitCode = 1;
} else {
  const runId = `policy-ui-${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID()}`;
  const directory = resolve('evidence', runId);
  await mkdir(directory, { recursive: true });
  let checkpointNumber = 0;
  let supportedPacket: ResearchPacket | null = null;
  const report: Record<string, unknown> = {
    scope: 'ACTUAL_LOCAL_BROWSER_PROVIDER_INTEGRATION_NOT_FINAL_BENCHMARK', runId,
    synthetic: true, model: process.env.NEBIUS_MODEL, outcome: 'running',
    validatedLiveModelSuccess: false, semanticFidelityReview: 'pending',
    limit: 'Three actual HTTP attempts total; no retries, repair calls, or alternate provider.',
  };
  const save = async (stage: string): Promise<void> => {
    const safe = JSON.parse(JSON.stringify({ ...report, stage, http: meter.snapshot() }, (_key, value) => typeof value === 'string' ? keys.reduce((text, key) => text.replaceAll(key, '[REDACTED]'), value) : value));
    await writeFile(resolve(directory, `${String(++checkpointNumber).padStart(3, '0')}-${stage}.json`), serializeEvaluationEvidence(safe), { flag: 'wx', mode: 0o600 });
  };
  const meter = createRequestMeter(3, (async (input, init) => {
    await save('http-reserved');
    return fetch(input, init);
  }) as typeof fetch);
  const request: typeof fetch = async (input, init) => {
    try {
      const response = await meter.request(input, init);
      const url = input instanceof Request ? input.url : String(input);
      if (url === 'https://api.tokenfactory.nebius.com/v1/chat/completions' && supportedPacket) report.modelDiagnostic = await diagnosePolicyResponse(response.clone(), supportedPacket);
      return response;
    }
    finally { await save('http-outcome'); }
  };
  const identities: Record<string, string> = {};
  for (const file of ['server/nebius.ts', 'server/policy-draft.ts', 'server/app.ts', 'src/PolicyResearch.tsx']) identities[file] = createHash('sha256').update(await readFile(file)).digest('hex');
  report.sourceIdentities = identities;
  await save('prepared');
  const app = createApp(true, { ...process.env, APP_ORIGIN: undefined, PUBLIC_DEMO: 'false' }, request);
  app.use(express.static(resolve(FRONTEND_DIRECTORY)));
  const server = app.listen(0, '127.0.0.1');
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing local address');
    const base = `http://127.0.0.1:${address.port}`;
    report.loopbackOnly = true;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, acceptDownloads: true });
    let searchClicks = 0, modelClicks = 0, pageErrorCount = 0;
    page.on('pageerror', () => { pageErrorCount++; });
    page.on('request', req => {
      if (req.method() !== 'POST') return;
      const body = req.postDataJSON();
      if (body?.live && req.url().endsWith('/api/research')) searchClicks++;
      if (body?.live && req.url().endsWith('/api/remediate')) modelClicks++;
    });
    await page.goto(base);
    await expect(page.getByText('504 validated orders')).toBeVisible();
    await page.getByRole('button', { name: /^Findings/ }).click();
    await page.getByLabel('Discount origin').selectOption('manual');
    await page.locator('.policy-card .consent input').check();
    const searchResponse = page.waitForResponse(res => res.url().endsWith('/api/research') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Search official policies', exact: true }).click();
    const returnedSearch = await searchResponse;
    const packet = await returnedSearch.json() as ResearchPacket;
    expect(returnedSearch.status()).toBe(200); expect(packet.mode).toBe('live'); expect(packet.status).toBe('ok'); expect(packet.proof?.requestId).toBeTruthy();
    report.search = { mode: packet.mode, status: packet.status, proof: packet.proof, checkedAt: packet.checkedAt, sources: packet.sources.map(source => ({ id: source.id, url: source.url, excerptSha256: createHash('sha256').update(source.snippet).digest('hex') })) };
    const decision = decidePolicy('discount', packet);
    supportedPacket = { ...packet, sources: packet.sources.filter(source => decision.sourceIds.includes(source.id)) };
    await expect(page.locator('.decision-status')).toHaveText('Initial settings fix contradicted');
    await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
    await save('live-search-visible');
    const modelResponse = page.waitForResponse(res => res.url().endsWith('/api/remediate') && res.request().method() === 'POST');
    await page.getByRole('button', { name: 'Draft with NVIDIA', exact: true }).click();
    const returnedModel = await modelResponse;
    const remedy = await returnedModel.json() as Remediation;
    expect(returnedModel.status()).toBe(200);
    report.remediation = remedy;
    if (remedy.mode !== 'live') {
      await expect(page.locator('.remediation')).toContainText('Offline analyst checks');
      await expect(page.locator('.remediation .proof')).toHaveCount(0);
      report.fallbackVisibleWithoutLiveProof = true;
    }
    expect(remedy.mode).toBe('live'); expect(remedy.proof?.requestId).toBeTruthy();
    expect(keys.some(key => JSON.stringify(remedy).includes(key))).toBe(false);
    await expect(page.locator('.remediation')).toContainText('NVIDIA / Nebius');
    for (const claim of remedy.documentedPolicy) await expect(page.locator('.remediation')).toContainText(claim.statement);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export policy evidence & provenance', exact: true }).click();
    const exported = await download;
    const exportPath = resolve(directory, 'policy-export.md');
    await exported.saveAs(exportPath);
    const exportedText = await readFile(exportPath, 'utf8');
    expect(exportedText).toContain('Search mode: live'); expect(exportedText).toContain('Model mode: live');
    expect(exportedText).toContain(remedy.proof!.requestId!);
    report.exportVerified = true;
    await page.locator('.remediation').screenshot({ path: resolve(directory, 'live-remediation.png') });
    await page.getByLabel('Discount origin').selectOption('unknown');
    await expect(page.locator('.remediation')).toHaveCount(0);
    await page.getByRole('button', { name: 'Preview source fixtures', exact: true }).click();
    await expect(page.locator('.decision-status')).toContainText('Hold');
    await expect(page.getByRole('button', { name: 'Draft with NVIDIA', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
    await expect(page.locator('.remediation')).toHaveCount(0);
    expect(searchClicks).toBe(1); expect(modelClicks).toBe(1); expect(pageErrorCount).toBe(0);
    expect(meter.snapshot().attemptedHttpRequests).toBe(3);
    report.browser = { liveSearchPosts: searchClicks, liveModelPosts: modelClicks, pageErrorCount, unknownContextHeld: true, resetClearedResults: true };
    report.validatedLiveModelSuccess = true; report.outcome = 'passed';
    await save('complete');
    console.log(`Actual local browser integration passed: three HTTP attempts, NVIDIA request ${remedy.proof!.requestId}; report ${directory}. Not a final benchmark.`);
  } catch {
    report.outcome = 'failed';
    await save('failed');
    console.error(`Live UI integration stopped; inspect sanitized checkpoints in ${directory}. No automatic retry. Reserved requests may have consumed usage.`);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
}
