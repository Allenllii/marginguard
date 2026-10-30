import { test, expect } from '@playwright/test';
import type { ResearchPacket } from '../shared/types';

test('Policy-to-Test reuses one fixture packet, changes only the hypothesis, and follows a context change', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  const requests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') requests.push(new URL(request.url()).pathname); });
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const lab = page.getByRole('region', { name: 'Policy-to-Test', exact: true });
  await expect(lab).toBeVisible();
  await lab.locator('summary.ptl-oneline').click();
  const native = lab.getByRole('article', { name: 'Normal / code', exact: true });
  const manual = lab.getByRole('article', { name: 'Manual / POS / draft', exact: true });
  const unknown = lab.getByRole('article', { name: 'Unknown', exact: true });
  await expect(native.locator('.ptl-verdict')).toContainText('Supported for investigation');
  await expect(manual.locator('.ptl-verdict')).toHaveText('Exception challenges remedy');
  await expect(unknown.locator('.ptl-verdict')).toContainText('On hold');
  await expect(lab.locator('.ptl-mode')).toHaveText('Saved result · no live call');
  await expect(lab.locator('.ptl-boundary')).toContainText('do not execute a change or test a real store');
  const exposure = await page.locator('.policy-input-evidence strong').textContent();
  const count = requests.length;
  const selector = lab.getByLabel('Choose the repair to challenge', { exact: true });
  await selector.focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(manual.locator('.ptl-verdict')).toHaveText('Supported for investigation');
  await expect(unknown.locator('.ptl-verdict')).toContainText('On hold');
  expect(await page.locator('.policy-input-evidence strong').textContent()).toBe(exposure);
  expect(requests).toHaveLength(count);
  await manual.locator('summary').click();
  await expect(manual.locator('blockquote').filter({ hasText: 'apply manually in Shopify POS always apply' })).toHaveCount(1);
  await expect(manual.locator('a[href="https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts"]')).toHaveCount(1);
  // Saved mode: a context change re-runs the saved decision at once (no live call).
  await page.getByLabel('Discount origin').selectOption('native');
  await expect(native.locator('.ptl-verdict')).toHaveText('Supported for investigation');
  await expect(manual.locator('.ptl-verdict')).toContainText('On hold');
  await page.getByLabel('Policy finding').selectOption({ label: 'Shipping overrun' });
  // The recorded USPS Search + Extract replay carries three official sources.
  await expect(page.locator('.policy-source')).toHaveCount(3);
  await expect(lab).toHaveCount(0);
  expect(requests.every(path => path === '/api/research')).toBe(true);
});

test('Policy-to-Test keeps failed, retracted and wrong-region fixture packets on HOLD', async ({ page, baseURL }) => {
  const fixture = await page.request.post('/api/research', { headers: { Origin: baseURL! }, data: { kind: 'discount', live: false, context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' } } });
  expect(fixture.ok()).toBe(true);
  const packet = await fixture.json() as ResearchPacket;
  let variant: ResearchPacket = { ...packet, status: 'no-results', sources: [] };
  await page.route('**/api/research', route => route.fulfill({ json: variant }));
  await page.goto('/'); await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const lab = page.getByRole('region', { name: 'Policy-to-Test', exact: true });
  await expect(lab.locator('.ptl-hold')).toHaveCount(3);
  variant = { ...packet, sources: packet.sources.map(source => ({ ...source, snippet: 'Manual discounts bypass combination settings. The previous sentence is false.' })) };
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  await expect(lab.locator('.ptl-hold')).toHaveCount(3);
  await expect(lab.locator('blockquote')).toHaveCount(0);
  variant = { ...packet, context: { ...packet.context, region: 'UK' } };
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  await expect(lab.locator('.ptl-hold')).toHaveCount(3);
  await expect(lab.locator('.ptl-mode')).toContainText('Saved result');
});

test('Policy-to-Test stays readable at 320px with keyboard targets and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const lab = page.getByRole('region', { name: 'Policy-to-Test', exact: true });
  await lab.scrollIntoViewIfNeeded();
  await expect(lab).toBeVisible();
  await lab.locator('summary.ptl-oneline').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const selector = lab.getByLabel('Choose the repair to challenge', { exact: true });
  expect(await selector.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await selector.focus(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(selector).toHaveValue('audit-manual-overrides');
  await expect(lab.getByRole('status')).toContainText('2 on hold');
  const moving = await lab.locator('*').evaluateAll(elements => elements.filter(element => { const style = getComputedStyle(element); return style.animationName !== 'none' || style.transitionDuration.split(',').some(duration => parseFloat(duration) > 0); }).length);
  expect(moving).toBe(0);
  await lab.screenshot({ path: 'evidence/policy-to-test-integrated-320.png', animations: 'disabled' });
});

test('accessibility at 375px: verdict changes are announced, origin switch is one tap from the case, small controls are ≥24px, hidden file input skips Tab', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  await expect(page.getByLabel('Import order CSV')).toHaveAttribute('tabindex', '-1');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).focus(); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)).not.toBe('file');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const live = page.getByTestId('decision-announcer');
  await expect(live).toHaveText(/^Policy says the suggested fix won’t work\. Next check: Audit staff\/manual POS/);
  await page.getByRole('button', { name: 'Switch discount origin', exact: true }).click();
  const origin = page.getByLabel('Discount origin');
  await expect(origin).toBeFocused(); await expect(origin).toBeInViewport();
  await origin.selectOption('unknown');
  await expect(live).toHaveText(/^On hold — needs more evidence\. Next check: Identify the discount origin/);
  const targets = [page.getByRole('button', { name: 'Reset demo', exact: true }), page.getByRole('button', { name: 'Export policy evidence', exact: true }), page.getByRole('link', { name: 'Open official source' }).first()];
  for (const target of targets) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  await page.evaluate(() => { location.hash = '#preflight'; });
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.locator('main.main')).toBeHidden();
});
