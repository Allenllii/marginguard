import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const lock = (page: Page) => page.getByRole('button', { name: 'Lock current basket and costs', exact: true });
const compare = (page: Page) => page.getByRole('button', { name: 'Compare original and adjusted rules', exact: true });
const confirmation = (page: Page) => page.getByRole('checkbox', { name: 'I explicitly chose and reviewed the adjusted rules for this simulation', exact: true });
const original = (page: Page) => page.getByTestId('comparison-original-contribution');
const adjusted = (page: Page) => page.getByTestId('comparison-adjusted-contribution');
const delta = (page: Page) => page.getByTestId('comparison-delta');
const reference = (page: Page) => page.getByLabel('Adjustment evidence reference', { exact: true });

async function openComparison(page: Page) {
  await page.goto('/#preflight');
  await expect(page.getByRole('heading', { name: 'Compare the same cart', exact: true })).toBeHidden();
  await page.getByText('Advanced: compare the same cart with adjusted rules', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare the same cart', exact: true })).toBeVisible();
}

async function prepareGolden(page: Page) {
  await lock(page).click();
  await page.getByRole('button', { name: 'Remove adjusted rule 2', exact: true }).click();
  await reference(page).fill('Synthetic seller adjustment: remove ORDER20 for this experiment');
  await confirmation(page).check();
}

async function downloadReport(page: Page) {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download comparison JSON', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  return JSON.parse(await readFile(path!, 'utf8'));
}

test('same-cart comparison keeps the original collision and explicitly chosen alternative on one locked snapshot', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(error.message));
  await openComparison(page);
  await expect(page.getByLabel('Comparison quantity for DEMO-SKU', { exact: true })).toHaveValue('1');
  await prepareGolden(page);
  await expect(page.getByLabel('Comparison quantity for DEMO-SKU', { exact: true })).toBeDisabled();
  await compare(page).focus();
  await page.keyboard.press('Enter');
  await expect(original(page)).toHaveText('-$6.00');
  await expect(adjusted(page)).toHaveText('$2.00');
  await expect(delta(page)).toContainText('$8.00');
  await expect(page.getByTestId('comparison-status')).toHaveText('On hold');
  await expect(page.getByRole('region', { name: 'Same-cart comparison report', exact: true })).toBeFocused();
  const report = await downloadReport(page);
  expect(report.original.basket).toEqual([{ skuId: 'DEMO-SKU', quantity: 1 }]);
  expect(report.adjusted.basket).toEqual(report.original.basket);
  for (const key of ['subtotalCents', 'cogsCents', 'shippingCostCents']) expect(report.adjusted[key]).toBe(report.original[key]);
  expect(report.original.contributionCents).toBe(-600);
  expect(report.adjusted.contributionCents).toBe(200);
  expect(report.deltaCents).toBe(800);
  expect(report.input.rules.map((rule: { id: string }) => rule.id)).toEqual(['PRODUCT20', 'ORDER20', 'FREESHIP']);
  expect(report.adjustedRules.map((rule: { id: string }) => rule.id)).toEqual(['PRODUCT20', 'FREESHIP']);
  expect(report.input.evidence.mode).toBe('fixture');
  expect(report.quantities).toEqual([1]);
  expect(report.status).toBe('HOLD');
  expect(report.holdReasons.length).toBeGreaterThan(0);
  expect(report.adjustmentReference).toContain('Synthetic seller adjustment');
  expect(report.sellerConfirmed).toBe(true);
  expect(report.assumptions.join(' ')).toMatch(/integer cents|half.up/i);
  expect(report.boundary).toMatch(/actual|realized|savings|sales/i);
  expect(requests.filter(url => url.includes('/api/'))).toEqual([]);
  expect(requests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(errors).toEqual([]);
});

test('rule and evidence edits immediately clear amounts and confirmation, even after reverting', async ({ page }) => {
  await openComparison(page); await prepareGolden(page); await compare(page).click();
  await expect(delta(page)).toContainText('$8.00');
  const value = page.getByLabel('Adjusted rule 1 value', { exact: true });
  await value.fill('10');
  await expect(original(page)).toHaveCount(0);
  await expect(adjusted(page)).toHaveCount(0);
  await expect(delta(page)).toHaveCount(0);
  await expect(confirmation(page)).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Download comparison JSON', exact: true })).toHaveCount(0);
  await value.fill('20');
  await expect(delta(page)).toHaveCount(0);
  await confirmation(page).check(); await compare(page).click();
  await expect(delta(page)).toContainText('$8.00');
  const previousReference = await reference(page).inputValue();
  await reference(page).fill('Updated synthetic adjustment evidence');
  await expect(original(page)).toHaveCount(0);
  await expect(confirmation(page)).not.toBeChecked();
  await reference(page).fill(previousReference);
  await expect(delta(page)).toHaveCount(0);
  await confirmation(page).check(); await compare(page).click();
  await expect(delta(page)).toContainText('$8.00');
  await confirmation(page).uncheck();
  await expect(delta(page)).toHaveCount(0);
  await confirmation(page).check();
  await expect(delta(page)).toHaveCount(0);
});

test('identical reviewed rules have an exact zero delta and preserve both original traces', async ({ page }) => {
  await openComparison(page); await lock(page).click();
  await reference(page).fill('Synthetic control: keep the original rule sequence unchanged');
  await confirmation(page).check(); await compare(page).click();
  await expect(original(page)).toHaveText('-$6.00');
  await expect(adjusted(page)).toHaveText('-$6.00');
  await expect(delta(page)).toContainText('$0.00');
  const report = await downloadReport(page);
  expect(report.deltaCents).toBe(0);
  expect(report.adjusted).toEqual(report.original);
  expect(report.adjustedRules).toEqual(report.input.rules);
});

test('editing the source costs invalidates the entire lock and both comparison sides', async ({ page }) => {
  await openComparison(page); await prepareGolden(page); await compare(page).click();
  await expect(delta(page)).toContainText('$8.00');
  await page.getByLabel('SKU 1 unit cost ($)', { exact: true }).fill('31.00');
  await expect(original(page)).toHaveCount(0);
  await expect(adjusted(page)).toHaveCount(0);
  await expect(delta(page)).toHaveCount(0);
  await expect(lock(page)).toBeEnabled();
  await expect(page.getByLabel('Comparison quantity for DEMO-SKU', { exact: true })).toBeEnabled();
  await page.getByLabel('SKU 1 unit cost ($)', { exact: true }).fill('30.00');
  await expect(delta(page)).toHaveCount(0);
});

test('missing adjustment evidence or seller review preserves HOLD without inventing an improvement', async ({ page }) => {
  await openComparison(page); await lock(page).click();
  await page.getByRole('button', { name: 'Remove adjusted rule 2', exact: true }).click();
  await compare(page).click();
  await expect(page.getByTestId('comparison-status')).toHaveText('On hold');
  const report = await downloadReport(page);
  expect(report.sellerConfirmed).toBe(false);
  expect(report.adjustmentReference).toBe('');
  expect(report.holdReasons.join(' ')).toMatch(/adjustment|adjusted|review|confirm/i);
  expect(report.status).toBe('HOLD');
});

test('seller evidence and confirmed semantics gate REVIEW and MODEL_CLEAR for the same reviewed rules', async ({ page }) => {
  await openComparison(page);
  await page.getByRole('checkbox', { name: 'I am using seller-attested inputs with the references recorded below.', exact: true }).check();
  await page.getByLabel('Price / cost evidence reference', { exact: true }).fill('Synthetic seller worksheet revision A');
  await page.getByLabel('Rule eligibility / sequence evidence reference', { exact: true }).fill('Synthetic seller combination experiment revision B');
  await page.getByLabel('Shipping / payment fee evidence reference', { exact: true }).fill('Synthetic seller shipping and fee schedule revision C');
  await page.getByRole('checkbox', { name: /I explicitly confirm this simulation/ }).check();
  await lock(page).click();
  await reference(page).fill('Synthetic seller control: explicitly retain the original rules');
  await confirmation(page).check(); await compare(page).click();
  await expect(page.getByTestId('comparison-status')).toHaveText('Review risk');
  await expect(original(page)).toHaveText('-$6.00');
  await expect(adjusted(page)).toHaveText('-$6.00');
  await expect(delta(page)).toContainText('$0.00');
  const review = await downloadReport(page);
  expect(review.input.evidence.mode).toBe('user');
  expect(review.input.evidence.semantics).toBe('explicit_simulation');
  expect(review.holdReasons).toEqual([]);
  expect(review.riskBreach).toBe(true);

  await page.getByRole('button', { name: 'Remove rule 2', exact: true }).click();
  await page.getByRole('button', { name: 'Remove rule 1', exact: true }).click();
  await expect(delta(page)).toHaveCount(0);
  await lock(page).click();
  await reference(page).fill('Synthetic seller control: review the retained free-shipping rule');
  await confirmation(page).check(); await compare(page).click();
  await expect(page.getByTestId('comparison-status')).toHaveText('Clear in model');
  await expect(original(page)).toHaveText('$12.00');
  await expect(adjusted(page)).toHaveText('$12.00');
  await expect(delta(page)).toContainText('$0.00');
  const clear = await downloadReport(page);
  expect(clear.holdReasons).toEqual([]);
  expect(clear.riskBreach).toBe(false);
  expect(clear.original.basket).toEqual(clear.adjusted.basket);
  expect(clear.status).toBe('MODEL_CLEAR');
});

test('invalid source money fails before locking, and malformed adjusted percentages clear the report', async ({ page }) => {
  await openComparison(page);
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('1e3');
  await lock(page).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/dollar amount/i);
  await expect(original(page)).toHaveCount(0);
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('50.00');
  await lock(page).click();
  await page.getByLabel('Adjusted rule 1 value', { exact: true }).fill('10001');
  await reference(page).fill('Synthetic invalid rule experiment');
  await confirmation(page).check(); await compare(page).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(original(page)).toHaveCount(0);
  await expect(delta(page)).toHaveCount(0);
});

test('percentage rounding uses one shared three-unit basket and integer half-up cents', async ({ page }) => {
  await openComparison(page);
  await page.getByRole('button', { name: 'Remove rule 3', exact: true }).click();
  await page.getByRole('button', { name: 'Remove rule 2', exact: true }).click();
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('1.05');
  await page.getByLabel('SKU 1 unit cost ($)', { exact: true }).fill('0');
  await page.getByLabel(/^Customer shipping charge \(\$\)/).fill('0');
  await page.getByLabel(/^Your shipping cost \(\$\)/).fill('0');
  await page.getByLabel(/^Payment fee \(%\)/).fill('0');
  await page.getByLabel('Rule 1 discount (%)', { exact: true }).fill('10');
  await page.getByRole('combobox', { name: 'Quantity limit per SKU', exact: true }).selectOption('3');
  await expect(page.getByLabel('Comparison quantity for DEMO-SKU', { exact: true })).toHaveValue('3');
  await lock(page).click();
  await page.getByLabel('Adjusted rule 1 value', { exact: true }).fill('0');
  await reference(page).fill('Synthetic half-cent boundary comparison');
  await confirmation(page).check(); await compare(page).click();
  await expect(original(page)).toHaveText('$2.83');
  await expect(adjusted(page)).toHaveText('$3.15');
  await expect(delta(page)).toContainText('$0.32');
  const report = await downloadReport(page);
  expect(report.original.discountCents).toBe(32);
  expect(report.quantities).toEqual([3]);
  expect(report.adjusted.basket).toEqual(report.original.basket);
});

test('natural Tab navigation visits adjusted-rule controls and reaches compare without a keyboard trap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openComparison(page); await lock(page).click();
  await page.getByLabel('Adjusted rule 1 ID', { exact: true }).focus();
  const visited: string[] = [];
  for (let step = 0; step < 80; step++) {
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      const bounds = element?.getBoundingClientRect();
      const name = element?.getAttribute('aria-label')
        || (element as HTMLInputElement | null)?.labels?.[0]?.textContent?.trim()
        || element?.textContent?.trim() || '';
      return {
        name,
        insideEditor: !!element?.closest('.pc-editor'),
        visible: !!bounds && bounds.width > 0 && bounds.height > 0
          && bounds.top < innerHeight && bounds.bottom > 0
          && bounds.left >= 0 && bounds.right <= innerWidth
          && !element?.closest('[hidden]')
          && getComputedStyle(element!).visibility !== 'hidden',
      };
    });
    expect(focus.insideEditor, `Tab ${step}: ${focus.name}`).toBe(true);
    expect(focus.visible, `Tab ${step}: ${focus.name}`).toBe(true);
    visited.push(focus.name);
    if (await compare(page).evaluate(element => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(compare(page)).toBeFocused();
  for (const name of ['Adjusted rule 1 ID', 'Remove adjusted rule 1', 'Adjusted rule 1 type', 'Adjusted rule 1 value', 'Adjusted rule 1 scope', 'Adjusted rule 1 minimum subtotal', 'Adjusted rule 1 minimum items', 'Adjustment evidence reference', 'I explicitly chose and reviewed the adjusted rules for this simulation']) {
    expect(visited.some(visitedName => visitedName.startsWith(name)), name).toBe(true);
  }
});

test('same-cart report keeps amounts and assumptions accessible at 200 percent CSS zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openComparison(page);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await prepareGolden(page); await compare(page).click();
  const report = page.getByRole('region', { name: 'Same-cart comparison report', exact: true });
  await expect(report).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const [amount, expected] of [[original(page), '-$6.00'], [adjusted(page), '$2.00'], [delta(page), '$8.00']] as const) {
    await amount.scrollIntoViewIfNeeded();
    await expect(amount).toBeVisible();
    await expect(amount).toBeInViewport();
    await expect(amount).toContainText(expected);
  }
  const summary = report.locator('summary');
  await summary.scrollIntoViewIfNeeded();
  await expect(summary).toBeVisible();
  await expect(summary).toBeInViewport();
  await expect(summary).toHaveText('Shared assumptions, formula and references');
  await summary.focus(); await page.keyboard.press('Enter');
  await expect(report.locator('details')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await report.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'evidence/same-cart-ab-zoom-200.png', animations: 'disabled' });
});

test('maximum supported amounts and long supplied identifiers and references wrap at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await openComparison(page);
  await page.getByLabel('SKU 1 ID', { exact: true }).fill('A'.repeat(40));
  await page.getByLabel('SKU 1 price ($)', { exact: true }).fill('10000.00');
  await page.getByLabel('SKU 1 unit cost ($)', { exact: true }).fill('10000.00');
  await page.getByLabel(/^Customer shipping charge \(\$\)/).fill('10000.00');
  await page.getByLabel(/^Your shipping cost \(\$\)/).fill('10000.00');
  await page.getByLabel(/^Payment fee \(%\)/).fill('100');
  await page.getByRole('combobox', { name: 'Quantity limit per SKU', exact: true }).selectOption('3');
  await lock(page).click();
  await page.getByLabel('Adjusted rule 1 ID', { exact: true }).fill('B'.repeat(40));
  await reference(page).fill('R'.repeat(240));
  await confirmation(page).check(); await compare(page).click();
  await expect(original(page)).toHaveText('-$40,000.00');
  await expect(adjusted(page)).toHaveText('-$40,000.00');
  await expect(delta(page)).toHaveText('$0.00');
  const report = page.getByRole('region', { name: 'Same-cart comparison report', exact: true });
  await report.getByText('Shared assumptions, formula and references', { exact: true }).click();
  await expect(report.getByText('R'.repeat(240), { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [320, 390, 1440]) test(`same-cart comparison is keyboard usable and fits ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openComparison(page);
  await lock(page).focus(); await page.keyboard.press('Enter');
  const remove = page.getByRole('button', { name: 'Remove adjusted rule 2', exact: true });
  await remove.focus(); await page.keyboard.press('Enter');
  await reference(page).focus(); await page.keyboard.type('Synthetic keyboard-only adjustment');
  await confirmation(page).focus(); await page.keyboard.press('Space');
  await expect(confirmation(page)).toBeChecked();
  await compare(page).focus(); await page.keyboard.press('Enter');
  const report = page.getByRole('region', { name: 'Same-cart comparison report', exact: true });
  await expect(report).toBeFocused();
  await expect(original(page)).toHaveText('-$6.00');
  await expect(adjusted(page)).toHaveText('$2.00');
  await expect(page.getByTestId('comparison-status')).toHaveText('On hold');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const unnamedControls = await page.locator('input,select,button').evaluateAll(nodes => nodes.filter(node => {
    if (node instanceof HTMLButtonElement) return !(node.getAttribute('aria-label') || node.textContent?.trim());
    return !node.getAttribute('aria-label') && !(node as HTMLInputElement).labels?.length;
  }).length);
  expect(unnamedControls).toBe(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => {
    const element = document.activeElement;
    return !!element?.getClientRects().length && !element.closest('[hidden]');
  })).toBe(true);
  await report.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `evidence/same-cart-ab-${width}.png`, fullPage: true, animations: 'disabled' });
  await report.evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `evidence/same-cart-ab-report-${width}.png`, animations: 'disabled' });
});
