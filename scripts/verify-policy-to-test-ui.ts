import { chromium, expect } from '@playwright/test';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Own loopback-only Vite process and headless browser. This regression does not
// import the app server, credentials, data files, providers, or final benchmark.
const root = fileURLToPath(new URL('..', import.meta.url));
const evidence = resolve(root, 'evidence');
await mkdir(evidence, { recursive: true });
const report: Record<string, unknown> = {
  scope: 'OFFLINE_SYNTHETIC_COMPONENT_REGRESSION_NOT_FINAL_BENCHMARK',
  startedAt: new Date().toISOString(), outcome: 'running',
  fixture: 'tests/fixtures/policy-to-test.tsx',
  providerCalls: 0, csvAccess: false, externalRequestsBlocked: 0,
  checks: [] as string[],
};
const checks = report.checks as string[];
const pageErrors: string[] = [];
let server: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

try {
  server = await createServer({
    root, configFile: false, envDir: false, publicDir: false,
    plugins: [react()], logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false, open: false },
    optimizeDeps: { entries: ['tests/fixtures/policy-to-test.html'] },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Missing isolated loopback server address');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || request.method() !== 'GET') {
      report.externalRequestsBlocked = Number(report.externalRequestsBlocked) + 1;
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.setDefaultTimeout(10000);
  await page.goto(`${origin}/tests/fixtures/policy-to-test.html`, { waitUntil: 'networkidle' });
  const lab = page.getByRole('region', { name: 'Policy-to-Test', exact: true });
  await expect(lab).toBeVisible();
  const normal = lab.getByRole('article', { name: 'Normal / code', exact: true });
  const manual = lab.getByRole('article', { name: 'Manual / POS / draft', exact: true });
  const unknown = lab.getByRole('article', { name: 'Unknown', exact: true });
  await expect(lab.getByRole('article')).toHaveCount(3);
  await expect(normal.locator('.ptl-verdict')).toHaveText('Supported for investigation');
  await expect(manual.locator('.ptl-verdict')).toHaveText('Exception challenges remedy');
  await expect(unknown.locator('.ptl-verdict')).toHaveText('HOLD · evidence needed');
  await expect(lab.getByText('Synthetic counterfactual tests.', { exact: true })).toBeVisible();
  await expect(lab.getByText('Offline fixture · no provider call', { exact: true })).toBeVisible();
  await expect(lab.locator('.ptl-boundary')).toContainText('do not execute a change or test a real store');
  checks.push('three-labeled-scenarios', 'initial-supported-contradicted-hold', 'visible-synthetic-and-fixture-boundaries');

  const select = lab.getByLabel('Choose the repair to challenge', { exact: true });
  await page.keyboard.press('Tab');
  await expect(select).toBeFocused();
  const focus = await select.evaluate(element => {
    const style = getComputedStyle(element);
    return { visible: element.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(focus.visible).toBe(true);
  expect(focus.style).toBe('solid');
  expect(focus.width).toBeGreaterThanOrEqual(3);
  report.focus = focus;
  checks.push('keyboard-first-control-and-visible-focus');

  await page.keyboard.press('Tab');
  const normalSummary = normal.locator('summary');
  await expect(normalSummary).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(normal.locator('details')).toHaveAttribute('open', '');
  await expect(normal.locator('blockquote')).toHaveText('Eligible discount classes can combine when the relevant settings permit it.');
  await expect(normal.getByRole('link', { name: /Open cited policy/ })).toHaveAttribute('href', 'https://help.shopify.com/en/manual/discounts/discount-combinations');
  checks.push('keyboard-source-disclosure-and-exact-quote');

  await select.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('audit-manual-overrides');
  await expect(normal.locator('.ptl-verdict')).toHaveText('HOLD · evidence needed');
  await expect(manual.locator('.ptl-verdict')).toHaveText('Supported for investigation');
  await expect(unknown.locator('.ptl-verdict')).toHaveText('HOLD · evidence needed');
  await expect(lab.getByRole('status')).toHaveText('1 supported for investigation · 0 challenged by an exception · 2 on HOLD');
  expect(await normal.locator('.ptl-next-check').innerText()).not.toBe(await manual.locator('.ptl-next-check').innerText());
  checks.push('keyboard-action-change', 'manual-audit-supported-native-held', 'unknown-remains-held', 'distinct-next-checks');

  await page.keyboard.press('Home');
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('review-combination-settings');
  const widths: { width: number; documentWidth: number; maxElementRight: number }[] = [];
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1080 });
    await expect(unknown.locator('.ptl-verdict')).toHaveText('HOLD · evidence needed');
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      maxElementRight: Math.max(...Array.from(document.querySelectorAll('.policy-test-lab, .ptl-card, .ptl-controls select')).map(element => element.getBoundingClientRect().right)),
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(width);
    expect(layout.maxElementRight).toBeLessThanOrEqual(width);
    expect(layout.viewportWidth).toBe(width);
    widths.push({ width, documentWidth: layout.documentWidth, maxElementRight: layout.maxElementRight });
    await expect(select).toBeVisible();
    expect(await select.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    if (width === 320) await page.screenshot({ path: resolve(evidence, 'policy-to-test-mobile.png'), fullPage: true });
    if (width === 1440) await page.screenshot({ path: resolve(evidence, 'policy-to-test-desktop.png'), fullPage: true });
  }
  report.layouts = widths;
  checks.push('no-overflow-320-768-1440', '44px-select-target');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = await lab.evaluate(element => ({
    prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animatedElements: Array.from(element.querySelectorAll('*')).filter(child => {
      const style = getComputedStyle(child);
      return style.animationName !== 'none' || style.transitionDuration.split(',').some(duration => parseFloat(duration) > 0);
    }).length,
  }));
  expect(motion.prefersReducedMotion).toBe(true);
  expect(motion.animatedElements).toBe(0);
  report.reducedMotion = motion;
  checks.push('reduced-motion-respected');
  expect(pageErrors).toEqual([]);
  expect(report.externalRequestsBlocked).toBe(0);
  checks.push('no-browser-errors', 'no-external-or-non-get-browser-requests');
  report.outcome = 'passed';
  console.log(`Policy-to-Test offline UI regression passed (${checks.length} checks). Local proof: evidence/policy-to-test-ui.json`);
} catch (error) {
  report.outcome = 'failed';
  report.error = error instanceof Error ? error.message : String(error);
  console.error(`Policy-to-Test offline UI regression failed: ${report.error}`);
  process.exitCode = 1;
} finally {
  report.pageErrors = pageErrors;
  report.finishedAt = new Date().toISOString();
  try {
    await writeFile(resolve(evidence, 'policy-to-test-ui.json'), JSON.stringify(report, null, 2) + '\n');
  } finally {
    try { await browser?.close(); }
    finally { await server?.close(); }
  }
}
