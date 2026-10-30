import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const run = (page: Page) => page.getByRole('button', { name: 'Run collision test', exact: true }).click();
const worst = (page: Page) => page.getByTestId('preflight-worst-contribution');

test('golden collision is offline, auditable, held and keyboard focus reaches the report', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#preflight');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Collision-test a promotion');
  await expect(page.getByRole('main', { name: 'Promotion collision sandbox' })).toBeVisible();
  await expect(page.getByLabel('Synthetic example walkthrough')).toContainText('$6.00');
  await page.getByRole('button', { name: 'Run collision test', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(worst(page)).toHaveText('-$6.00');
  await expect(page.getByTestId('preflight-status')).toHaveText('On hold');
  await expect(page.getByTestId('preflight-scenario-count')).toHaveText('16 / 1008');
  await expect(page.getByRole('region', { name: 'What is left in the worst basket?' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Why this is on hold' })).toBeVisible();
  await expect(page.locator('.pf-trace')).toContainText('$40.00');
  await expect(page.locator('.pf-trace')).toContainText('$32.00');
  expect(requests.filter(url => url.includes('/api/'))).toEqual([]);
  expect(requests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
});

test('seller omits the order rule, stale results disappear, and the fixture stays HOLD at positive contribution', async ({ page }) => {
  await page.goto('/#preflight'); await run(page);
  await page.getByRole('button', { name: 'Remove rule 2', exact: true }).click();
  await expect(worst(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download JSON audit' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'What is left in the worst basket?' }).getByRole('status')).toContainText('previous result has been cleared');
  await run(page);
  await expect(worst(page)).toHaveText('$2.00');
  await expect(page.getByTestId('preflight-status')).toHaveText('On hold');
});

test('noninteger and malicious inputs fail closed with an accessible error', async ({ page }) => {
  await page.goto('/#preflight');
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('50.0.1'); await run(page);
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('dollar amount');
  await expect(worst(page)).toHaveCount(0);
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('50.00');
  await page.getByLabel('SKU 1 ID', { exact: true }).fill('<img src=x onerror=alert(1)>'); await run(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(worst(page)).toHaveCount(0);
});

test('three SKUs and quantity three exhaust the bounded 1008 scenarios; duplicates are rejected', async ({ page }) => {
  await page.goto('/#preflight');
  await page.getByRole('button', { name: 'Add SKU', exact: true }).click();
  await page.getByRole('button', { name: 'Add SKU', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add SKU', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add rule', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'Quantity limit per SKU', exact: true }).selectOption('3'); await run(page);
  await expect(page.getByTestId('preflight-scenario-count')).toHaveText('1008 / 1008');
  await page.getByLabel('SKU 2 ID', { exact: true }).fill('DEMO-SKU'); await run(page);
  await expect(page.getByRole('alert')).toContainText('duplicate SKU');
  await expect(worst(page)).toHaveCount(0);
});

test('zero rules is an explicit baseline experiment', async ({ page }) => {
  await page.goto('/#preflight');
  for (const index of [3, 2, 1]) await page.getByRole('button', { name: `Remove rule ${index}`, exact: true }).click();
  await run(page);
  await expect(worst(page)).toHaveText('$20.00');
  await expect(page.getByTestId('preflight-scenario-count')).toHaveText('1 / 1008');
  await expect(page.locator('.pf-audit-part')).toContainText(['No rules (baseline)']);
});

test('seller attestations and explicit semantics gate model labels; a missing reference restores HOLD', async ({ page }) => {
  await page.goto('/#preflight');
  await page.getByRole('checkbox', { name: 'I am using seller-attested inputs with the references recorded below.' }).check();
  await page.getByLabel('Price / cost evidence reference', { exact: true }).fill('Seller worksheet revision A');
  await page.getByLabel('Rule eligibility / sequence evidence reference', { exact: true }).fill('Seller combination experiment revision B');
  await page.getByLabel('Shipping / payment fee evidence reference', { exact: true }).fill('Seller shipping and fee schedule revision C');
  await run(page); await expect(page.getByTestId('preflight-status')).toHaveText('On hold');
  await page.getByRole('checkbox', { name: /I explicitly confirm this simulation/ }).check();
  await run(page); await expect(page.getByTestId('preflight-status')).toHaveText('Review risk');
  await page.getByRole('button', { name: 'Remove rule 2', exact: true }).click();
  await run(page); await expect(page.getByTestId('preflight-status')).toHaveText('Clear in model');
  await expect(page.locator('.pf-result-bound')).toContainText('not actual savings or a launch approval');
  await page.getByLabel('Shipping / payment fee evidence reference', { exact: true }).fill('');
  await run(page); await expect(page.getByTestId('preflight-status')).toHaveText('On hold');
});

test('JSON export contains replayable inputs, formula, trace, bounds and evidence gaps', async ({ page }) => {
  await page.goto('/#preflight'); await run(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON audit', exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('promo-preflight-audit.json');
  const downloadedPath = await download.path(); expect(downloadedPath).toBeTruthy();
  const report = JSON.parse(await readFile(downloadedPath!, 'utf8'));
  expect(report.status).toBe('HOLD'); expect(report.mode).toBe('offline');
  expect(report.worst.contributionCents).toBe(-600);
  expect(report.baseline.contributionCents).toBe(2000);
  expect(report.input.skus[0].priceCents).toBe(5000);
  expect(report.fullStackTrace.steps.map((step: { remainingMerchandiseCents: number }) => step.remainingMerchandiseCents)).toEqual([4000, 3200, 3200]);
  expect(report.searchSpace.maxScenarios).toBe(1008);
  expect(report.holdReasons.length).toBeGreaterThan(0);
  expect(report.formula).toContain('contribution');
});

for (const width of [320, 375, 390, 1440]) test(`layout and labels: ${width}px, reduced motion, all controls have accessible names`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#preflight'); await run(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const unnamedControls = await page.locator('input,select,button').evaluateAll(nodes => nodes.filter(node => {
    if (node instanceof HTMLButtonElement) return !(node.getAttribute('aria-label') || node.textContent?.trim());
    return !node.getAttribute('aria-label') && !(node as HTMLInputElement).labels?.length;
  }).length);
  expect(unnamedControls).toBe(0);
  await expect(worst(page)).toHaveText('-$6.00');
  const report = await page.getByRole('region', { name: 'What is left in the worst basket?' }).boundingBox();
  expect(report).toBeTruthy(); expect(report!.y).toBeGreaterThanOrEqual(0); expect(report!.y).toBeLessThan(60);
  await page.screenshot({ path: `evidence/promo-preflight-report-${width}.png`, animations: 'disabled' });
  await page.evaluate(() => window.scrollTo(0, 0));
  if (width !== 390) await page.screenshot({ path: `evidence/promo-preflight-${width}.png`, fullPage: true, animations: 'disabled' });
});

test('navigation preserves the existing analysis entry and can return from the isolated sandbox', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('link', { name: 'Promo Preflight', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Collision-test a promotion');
  await page.getByRole('link', { name: /Back to analysis/ }).click();
  await expect(page.getByText('504 validated orders')).toBeVisible();
});

test('switching workspaces preserves an imported dataset, its assumptions and the sandbox result', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByLabel('Import order CSV', { exact: true }).setInputFiles('data/template.csv');
  await expect(page.locator('.dataset-strip')).not.toContainText('504 validated orders');
  const dataset = await page.locator('.dataset-strip').textContent();
  await page.getByLabel('Discount ceiling percent', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
  await expect(page.getByLabel('Discount ceiling percent', { exact: true })).toHaveValue('25');
  const mobile = page.getByRole('button', { name: 'Toggle navigation', exact: true });
  if (await mobile.isVisible()) await mobile.click();
  await page.getByRole('link', { name: 'Promo Preflight', exact: true }).click();
  await run(page); await expect(worst(page)).toHaveText('-$6.00');
  await page.getByRole('link', { name: /Back to analysis/ }).click();
  await expect(page.locator('.dataset-strip')).toHaveText(dataset!);
  await expect(page.getByLabel('Discount ceiling percent', { exact: true })).toHaveValue('25');
  await page.getByRole('link', { name: 'Promo Preflight', exact: true }).click();
  await expect(worst(page)).toHaveText('-$6.00');
});

test('browser Back to Preflight releases hidden evidence-drawer scroll and keyboard effects', async ({ page }) => {
  await page.goto('/#preflight');
  await page.getByRole('link', { name: /Back to analysis/ }).click();
  await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.locator('.finding-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Collision-test a promotion');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => { const element = document.activeElement; return !!element?.getClientRects().length && !element.closest('[hidden]'); })).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('seller units: dollars and percentages convert to exact integer cents and basis points', async ({ page }) => {
  await page.goto('/#preflight');
  const walkthrough = page.getByLabel('Synthetic example walkthrough');
  await expect(walkthrough).toContainText('SAMPLE WALKTHROUGH');
  await expect(walkthrough).toContainText('Without the order discount: contribution +$2.00');
  await expect(walkthrough.locator('.pf-pill')).toHaveCount(0);
  await expect(page.getByLabel('SKU 1 price ($)', { exact: true })).toHaveValue('50.00');
  await expect(page.getByLabel('Rule 1 discount (%)', { exact: true })).toHaveValue('20');
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('49.995');
  await expect(page.getByText('Rounded to $50.00 = 5000 cents', { exact: true })).toBeVisible();
  await page.getByLabel('Payment fee (%)', { exact: true }).fill('2.9');
  await expect(page.getByText('Uses 290 bp', { exact: true })).toBeVisible();
  await run(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON audit', exact: true }).click();
  const report = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
  expect(report.input.skus[0].priceCents).toBe(5000); expect(report.input.paymentFeeBps).toBe(290);
  expect(report.input.rules[0].basisPoints).toBe(2000);
  expect(Number.isInteger(report.worst.contributionCents)).toBe(true);
});

test('375px: visible back control, keyboard focus ring and no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#preflight');
  const back = page.getByRole('link', { name: /Back to analysis/ });
  await expect(back).toBeVisible();
  for (let i = 0; i < 6 && !(await back.evaluate(node => node === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(back).toBeFocused();
  expect(await back.evaluate(node => getComputedStyle(node).outlineStyle)).not.toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(page.getByText('504 validated orders')).toBeVisible();
});
