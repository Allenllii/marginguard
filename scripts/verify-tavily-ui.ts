import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const base = process.env.DEMO_URL || 'http://127.0.0.1:3000';
const health = await (await fetch(base + '/api/health')).json();
if (health.tavily.mode !== 'configured') throw new Error('Approved local Tavily configuration is not loaded. No live UI search attempted.');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
let liveSearches = 0, liveModelRequests = 0;
page.on('request', request => { if (request.method() !== 'POST') return; const body = request.postDataJSON(); if (body?.live && request.url().endsWith('/api/research')) liveSearches++; if (body?.live && /\/api\/(explain|remediate)$/.test(request.url())) liveModelRequests++; });
try {
  await page.goto(base); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click(); await page.getByLabel('Discount origin').selectOption('manual');
  await page.locator('.policy-card .consent input').check();
  const returned = page.waitForResponse(response => response.url().endsWith('/api/research') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Search official policies' }).click();
  const response = await returned, packet = await response.json();
  expect(response.status()).toBe(200); expect(packet.mode).toBe('live'); expect(packet.status).toBe('ok'); expect(packet.proof?.requestId).toBeTruthy();
  await expect(page.locator('.decision-status')).toHaveText('Initial settings fix contradicted');
  await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
  await expect(page.getByRole('button', { name: 'Draft with NVIDIA' })).toBeDisabled();
  await page.getByRole('button', { name: 'Draft offline checks' }).click(); await expect(page.locator('.remediation')).toContainText('No model called');
  const uiDecision = { status: await page.locator('.decision-status').innerText(), nextCheck: await page.getByTestId('decision-next-check').innerText(), citationURLs: await page.locator('.decision-card .source-citation').evaluateAll(nodes => nodes.map(n => (n as HTMLAnchorElement).href)) };
  expect(liveSearches).toBe(1); expect(liveModelRequests).toBe(0);
  await writeFile('evidence/tavily-ui-live-proof.json', JSON.stringify({ executedAt: new Date().toISOString(), scope: 'Actual browser → local backend → authorized free-tier Tavily request; synthetic data; no model inference.', liveSearches, liveModelRequests, packet, uiDecision, nvidiaStatus: health.provider.mode }, null, 2) + '\n');
  console.log(`Actual Tavily UI flow passed: request ${packet.proof.requestId}; ${packet.proof.latencyMs} ms; credits ${packet.proof.usageCredits}; decision ${uiDecision.status}; no NVIDIA call.`);
} finally { await browser.close(); }
