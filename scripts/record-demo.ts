import path from 'node:path';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= path.resolve('.playwright-browsers');
const { chromium } = await import('@playwright/test');
const chapters = [
  { seconds: 15, title: 'MarginGuard · evidence-conditioned recovery plans', text: 'A margin alert is only useful when it leads to the right check. MarginGuard separates exact CSV calculations, seller assumptions, policy constraints, and what remains uncertain. This is a synthetic, offline walkthrough.' },
  { seconds: 20, title: 'Synthetic input · reproducible, no customer data', text: 'We import five hundred and four seeded orders. There is no connected Shopify store. The manual-discount origin used later is invented seller-provided demo context, not something the CSV proves.' },
  { seconds: 20, title: 'Exact arithmetic · editable seller assumptions', text: 'The discount finding exposes its original rows and formula. The ceiling is a seller assumption, editable from zero to sixty percent. It is not a Shopify rule. Exposure is hypothetical, not recovered profit.' },
  { seconds: 40, title: 'Policy exception · the generic settings fix changes', text: 'Suppose the seller identifies these as manual, point-of-sale or draft-order discounts. The saved Shopify source review describes an exception: manual and Scripts API discounts can apply regardless of combination settings. The initial settings-fix hypothesis is contradicted. The next check becomes a staff and manual-override audit. These cards are explicitly offline source fixtures, not a live Tavily search.' },
  { seconds: 20, title: 'NVIDIA synthesis · fixture output is labeled', text: 'The intended NVIDIA-on-Nebius synthesis keeps policy, inference, and uncertainty separate. This run uses offline analyst checks and says no model was called. A genuine model request and semantic review are still required; this video is not live integration evidence.' },
  { seconds: 20, title: 'Missing context · hold and export', text: 'When discount origin is unknown, the recommendation is held. The exporter retains the CSV facts, threshold assumption, cited source, decision status, and disconfirming check. No changes are executed in a store.' },
  { seconds: 15, title: 'Observed local checks · live qualification remains open', text: 'Local checks cover exact cents, source routing, malicious inputs, response races, and mobile flows. Twelve predeclared synthetic routing cases pass. Actual Tavily and NVIDIA evidence, public smoke tests, and human policy-fidelity review remain separate gates.' },
];
await mkdir('evidence/video-raw', { recursive: true });
await writeFile('evidence/demo-narration-plan.json', JSON.stringify(chapters, null, 2) + '\n');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, recordVideo: { dir: 'evidence/video-raw', size: { width: 1440, height: 1080 } } });
let attemptedLive = 0;
await context.route('**/api/**', async route => { const raw = route.request().postData(); if (raw && JSON.parse(raw).live === true) { attemptedLive++; await route.abort(); } else await route.continue(); });
const page = await context.newPage();
await page.goto(process.env.DEMO_URL || 'http://127.0.0.1:3000');
await page.getByText('504 validated orders').waitFor();
async function caption(title: string, text: string) {
  await page.evaluate(({ title, text }) => {
    let box = document.getElementById('recording-caption');
    if (!box) { box = document.createElement('aside'); box.id = 'recording-caption'; box.style.cssText = 'position:fixed;bottom:14px;left:250px;right:24px;z-index:99999;background:#173b2ff2;color:white;border:1px solid #83a66a;border-radius:9px;padding:16px 20px;font:15px/1.55 Segoe UI,sans-serif;box-shadow:0 10px 30px #0002;pointer-events:none'; document.body.append(box); }
    box.replaceChildren(); const label = document.createElement('div'); label.textContent = 'OFFLINE FIXTURE WALKTHROUGH · NOT LIVE API EVIDENCE'; label.style.cssText = 'font-size:10px;letter-spacing:1.2px;color:#ccdf9f;margin-bottom:6px'; const heading = document.createElement('strong'); heading.textContent = title; heading.style.cssText = 'display:block;font-size:17px;margin-bottom:5px'; const body = document.createElement('div'); body.textContent = text; box.append(label, heading, body);
  }, { title, text });
}
const started = performance.now(); let deadline = started;
for (const [i, chapter] of chapters.entries()) {
  await caption(chapter.title, chapter.text); deadline += chapter.seconds * 1000;
  if (i === 1) { await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/northstar-demo.csv')); await page.getByText('504 validated orders').waitFor(); }
  if (i === 2) { await page.getByRole('button', { name: /^Findings/ }).click(); await page.locator('.finding-row').filter({ hasText: 'Promotions are stacking' }).click(); await page.getByRole('heading', { name: 'Show the math' }).waitFor(); }
  if (i === 3) { await page.getByRole('button', { name: 'Close evidence' }).click(); await page.getByLabel('Discount origin').selectOption('manual'); await page.getByRole('button', { name: 'Preview source fixtures' }).click(); await page.locator('.decision-status').filter({ hasText: 'contradicted' }).waitFor(); await page.locator('.policy-card').scrollIntoViewIfNeeded(); }
  if (i === 4) { await page.getByRole('button', { name: 'Draft offline checks' }).click(); await page.locator('.remediation').scrollIntoViewIfNeeded(); }
  if (i === 5) { await page.getByLabel('Discount origin').selectOption('unknown'); await page.getByRole('button', { name: 'Preview source fixtures' }).click(); await page.locator('.decision-status').filter({ hasText: 'Hold' }).waitFor(); await page.locator('.decision-card').scrollIntoViewIfNeeded(); const saving = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export policy evidence & provenance' }).click(); await (await saving).saveAs('evidence/demo-held-policy-report.md'); }
  if (i === 6) { await page.getByRole('button', { name: 'Data & method', exact: true }).click(); await page.evaluate(() => window.scrollTo(0, 0)); }
  console.log(`Recording chapter ${i + 1}/7: ${chapter.title}`);
  const remaining = deadline - performance.now(); if (remaining > 0) await page.waitForTimeout(remaining);
}
const video = page.video(); await context.close(); await browser.close();
if (attemptedLive) throw new Error('Recording attempted a live call and must not be used.');
const file = await video!.path(); await copyFile(file, 'evidence/marginguard-fixture-walkthrough.webm');
await writeFile('evidence/recording-manifest.json', JSON.stringify({ recordedAt: new Date().toISOString(), durationTargetSeconds: 150, actualElapsedSeconds: Math.round((performance.now() - started) / 1000), source: 'Actual local UI, synthetic dataset, source fixtures and offline guidance', liveProviderCalls: 0, publication: 'Local review draft only. Not uploaded publicly and not final live evidence.', narrationPlan: 'demo-narration-plan.json', sourceVideo: 'marginguard-fixture-walkthrough.webm', release: JSON.parse(await readFile('data/demo-context.json', 'utf8')) }, null, 2) + '\n');
console.log('Local 150-second fixture UI walkthrough recorded. No live calls or public upload.');
