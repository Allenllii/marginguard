import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

test('judge entry: one click shows the manual-discount action change, honest mode and working source branch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const decision = page.getByRole('region', { name: 'Evidence and next check', exact: true });
  await expect(decision).toContainText('28 flagged rows; $658.08 modeled exposure.');
  await expect(decision).toContainText('20% discount ceiling');
  await expect(decision).toContainText('Initial settings fix contradicted');
  await expect(decision).toContainText('Audit staff/manual POS');
  await expect(page.locator('.policy-card')).toContainText('Offline fixture');
  await expect(page.getByRole('link', { name: 'Source & version', exact: true })).toHaveAttribute('href', 'https://github.com/Allenllii/marginguard/tree/codex/judge-case-entry');
  await page.locator('.policy-card').screenshot({ path: 'evidence/judge-case-entry.png' });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  await expect(decision).toContainText('Audit staff/manual POS');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByLabel('Discount origin')).toHaveValue('unknown');
});

test('review: ordinary apps hold, confirmed Scripts API uses its own exception, and privacy names the server', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await expect(page.locator('.analyst-card')).toContainText("CSV uploads are sent to this app's server");
  await expect(page.locator('.analyst-card')).not.toContainText('stay local');
  await page.getByLabel('Discount origin').selectOption('app');
  await page.getByRole('button', { name: 'Preview source fixtures', exact: true }).click();
  const decision = page.getByRole('region', { name: 'Evidence and next check', exact: true });
  await expect(decision).toContainText('An app is not necessarily using the Scripts API');
  await expect(page.getByRole('button', { name: 'Draft with NVIDIA', exact: true })).toBeDisabled();
  await page.getByLabel('Discount origin').selectOption('scripts-api');
  await page.getByRole('button', { name: 'Preview source fixtures', exact: true }).click();
  await expect(decision).toContainText('Audit the originating Scripts API');
  await page.getByRole('button', { name: 'Draft offline checks', exact: true }).click();
  await expect(page.locator('.remediation')).toContainText('Scripts API exception');
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  await expect(page.locator('.method-card')).toContainText("CSV content is sent to this app's server");
  await expect(page.locator('.method-card')).toContainText('use synthetic or non-sensitive data');
  await expect(page.locator('.method-card')).not.toContainText('local server memory');
});

test('journey: policy evidence survives scenario navigation but a different dataset clears it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText("CSV uploads are sent to this app's server for validation and calculation; use synthetic or non-sensitive data.", { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByLabel('Discount origin').selectOption('manual');
  await page.getByRole('button', { name: 'Preview source fixtures', exact: true }).click();
  await page.getByRole('button', { name: 'Draft offline checks', exact: true }).click();
  await expect(page.locator('.remediation')).toContainText('Audit staff/manual POS');
  await page.getByRole('button', { name: 'Scenario lab', exact: true }).click();
  await page.getByRole('button', { name: 'Set all to zero', exact: true }).click();
  await expect(page.locator('.scenario-big')).toHaveText('+$0');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await expect(page.getByLabel('Discount origin')).toHaveValue('manual');
  await expect(page.locator('.remediation')).toContainText('Audit staff/manual POS');
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/invalid-example.csv'));
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.remediation')).toContainText('Audit staff/manual POS');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export policy evidence & provenance', exact: true }).click();
  await (await download).saveAs('evidence/navigation-policy-export.md');
  expect(await readFile('evidence/navigation-policy-export.md', 'utf8')).toContain('discount origin manual');
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/template.csv'));
  await expect(page.locator('.dataset-strip')).toContainText('1 validated order');
  await expect(page.getByRole('status')).toContainText("the app server's transient memory");
  await page.getByRole('button', { name: /^Findings/ }).click();
  await expect(page.locator('.remediation')).toHaveCount(0);
});

test('clarity: the evidence decision leads the draft and keeps assumptions, citations and authority explicit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByLabel('Discount origin').selectOption('manual');
  await page.getByRole('button', { name: 'Preview source fixtures', exact: true }).click();
  const decision = page.getByRole('region', { name: 'Evidence and next check', exact: true });
  await expect(decision.getByRole('heading', { name: 'Rule-based next check', exact: true })).toBeVisible();
  await expect(decision).toContainText('28 flagged rows; $658.08 modeled exposure.');
  await expect(decision).toContainText('20% discount ceiling');
  await expect(decision.locator('.source-citation')).toHaveAttribute('href', 'https://help.shopify.com/en/manual/discounts/discount-combinations');
  expect(await decision.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.policy-source')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.getByRole('button', { name: 'Draft offline checks', exact: true }).click();
  await expect(page.locator('.remediation')).toContainText('Policy scope is limited to the cited passage.');
  await expect(page.locator('.remediation')).toContainText('Rule-based rationale');
  await expect(page.locator('.remediation')).toContainText('A draft cannot approve a remedy or estimate recovery.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export policy evidence & provenance', exact: true }).click();
  const file = await download; await file.saveAs('evidence/decision-clarity-export.md');
  const text = await readFile('evidence/decision-clarity-export.md', 'utf8');
  expect(text).toContain('Decision authority: Rule-based policy check');
  expect(text).toContain('Draft authority: Review aid; cannot approve a remedy or estimate recovery');
  await page.locator('.policy-card').screenshot({ path: 'evidence/decision-clarity.png' });
});

test('desktop: overview, evidence, scenario, report, offline brief, valid and invalid import', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Healthy margins start here.' })).toBeVisible();
  await expect(page.getByText('504 validated orders')).toBeVisible();
  await expect(page.locator('.kpi.opportunity .kpi-value')).toContainText('$1,919');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/desktop-overview.png', fullPage: true });
  await page.getByRole('button', { name: 'Inspect top finding' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('$1,040.00', { exact: true })).toBeVisible();
  await expect(dialog.getByText('#380', { exact: true })).toBeVisible();
  const rowsDownload = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export rows' }).click();
  const rows = await rowsDownload; await rows.saveAs('evidence/exported-returns-evidence.csv');
  expect((await readFile('evidence/exported-returns-evidence.csv', 'utf8')).trim().split('\n')).toHaveLength(15);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/desktop-evidence.png', fullPage: true });
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Scenario lab', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your next move, modeled.' })).toBeVisible();
  await page.getByRole('button', { name: 'Set all to zero' }).click();
  await expect(page.locator('.scenario-big')).toHaveText('+$0');
  for (const slider of await page.getByRole('slider').all()) { await slider.focus(); await page.keyboard.press('End'); }
  await expect(page.locator('.scenario-big')).toHaveText('+$1,919');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/desktop-scenario.png', fullPage: true });
  const reportDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export this scenario' }).click();
  const report = await reportDownload; await report.saveAs('evidence/exported-report.md');
  expect(await readFile('evidence/exported-report.md', 'utf8')).toContain('Modeled contribution uplift: $1,918.58');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByRole('button', { name: 'Preview source fixtures' }).click();
  await expect(page.getByText('Offline fixture · no retrieval occurred', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Draft offline checks' }).click();
  await expect(page.getByText('Offline analyst checks', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open official source' })).toHaveAttribute('href', 'https://help.shopify.com/en/manual/discounts/discount-combinations');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/desktop-policy-evidence.png', fullPage: true });
  await page.locator('.policy-card').screenshot({ path: 'evidence/policy-feature.png' });
  const policyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export policy evidence & provenance' }).click();
  await (await policyDownload).saveAs('evidence/exported-policy-evidence.md');
  expect(await readFile('evidence/exported-policy-evidence.md', 'utf8')).toContain('Search mode: fixture');
  await expect(page.getByRole('button', { name: 'Generate NVIDIA brief' })).toBeDisabled();
  await page.getByRole('button', { name: 'Generate offline brief' }).click();
  await expect(page.getByText('Offline deterministic guidance', { exact: true })).toBeVisible();
  await expect(page.locator('.brief-result').getByText('No model called', { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/desktop-brief.png', fullPage: true });
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/invalid-example.csv'));
  await expect(page.getByRole('alert')).toContainText('real ISO date');
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/template.csv'));
  await expect(page.locator('.dataset-strip')).toContainText('1 validated order');
  await expect(page.getByText('No rule thresholds crossed')).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByText('504 validated orders')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile: navigation, evidence, and layout stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('504 validated orders')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/mobile-overview.png', fullPage: true });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Good analysis starts with good data.' })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.locator('.finding-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close evidence' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/mobile-evidence.png', fullPage: true });
  await page.getByRole('button', { name: 'Close evidence' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Preview source fixtures' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/mobile-policy-evidence.png', fullPage: true });
});

test('cancel, repeat evidence visits and navigation preserve the current dataset', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('504 validated orders')).toBeVisible();
  const choosing = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await (await choosing).setFiles([]);
  await expect(page.getByText('504 validated orders')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Inspect top finding' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close evidence' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  }
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByLabel('Import order CSV').setInputFiles({ name: 'too-large.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 'x') });
  await expect(page.getByRole('alert')).toContainText('2 MB limit');
  await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click();
  await expect(page.getByRole('button', { name: 'Search official policies' })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview source fixtures' }).click();
  await page.getByLabel('Policy finding').selectOption('shipping-overrun');
  await expect(page.getByText('EXACT GENERIC QUERY')).not.toBeVisible();
  await page.getByLabel('Shipping carrier').selectOption('UPS');
  await page.getByRole('button', { name: 'Preview source fixtures' }).click();
  await expect(page.getByRole('link', { name: 'Open official source' })).toHaveAttribute('href', /www.ups.com/);
  await expect(page.getByRole('button', { name: 'Draft with NVIDIA' })).toBeDisabled();
});

async function ignoreAbortForTest(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => original(input, typeof input === 'string' && /\/api\/(explain|research|remediate|analyze)$/.test(input) ? { ...init, signal: undefined } : init);
  });
}
async function holdResponse(page: Page, path: string, staleSummary = false) {
  let ready!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { ready = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  const pattern = `**${path}`;
  await page.route(pattern, async route => { const response = await route.fetch(); const body = await response.json(); ready(); await held; await route.fulfill({ response, json: staleSummary ? { ...body, summary: 'STALE DATASET EXPLANATION MUST NOT APPEAR' } : body }); });
  return { entered, async finish() { const done = page.waitForEvent('requestfinished', r => r.url().endsWith(path)); release(); await done; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await page.unroute(pattern); } };
}
test('delayed explanations are discarded after a different import and repeated same-data resets', async ({ page }) => {
  await ignoreAbortForTest(page); await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  for (const action of ['import', 'reset', 'reset'] as const) {
    if (action === 'reset') { await page.getByRole('button', { name: 'Reset demo' }).click(); await expect(page.getByText('504 validated orders')).toBeVisible(); }
    await page.getByRole('button', { name: /^Findings/ }).click();
    const held = await holdResponse(page, '/api/explain', true);
    await page.getByRole('button', { name: 'Generate offline brief' }).click(); await held.entered;
    if (action === 'import') { await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/template.csv')); await expect(page.locator('.dataset-strip')).toContainText('1 validated order'); }
    else { await page.getByRole('button', { name: 'Reset demo' }).click(); await expect(page.getByRole('status')).toContainText('Synthetic demo loaded'); }
    await held.finish();
    await page.getByRole('button', { name: /^Findings/ }).click();
    await expect(page.getByText('STALE DATASET EXPLANATION MUST NOT APPEAR')).toHaveCount(0); await expect(page.locator('.brief-result')).toHaveCount(0);
    const saving = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export report', exact: true }).click(); const file = await saving; await file.saveAs('evidence/race-safe-report.md'); expect(await readFile('evidence/race-safe-report.md', 'utf8')).not.toContain('STALE');
  }
});
test('delayed policy search and remediation cannot survive a same-dataset reset', async ({ page }) => {
  await ignoreAbortForTest(page); await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  for (const endpoint of ['/api/research', '/api/remediate']) {
    await page.getByRole('button', { name: /^Findings/ }).click();
    if (endpoint.endsWith('remediate')) { await page.getByRole('button', { name: 'Preview source fixtures' }).click(); await expect(page.getByText('EXACT GENERIC QUERY')).toBeVisible(); }
    const held = await holdResponse(page, endpoint);
    await page.getByRole('button', { name: endpoint.endsWith('research') ? 'Preview source fixtures' : 'Draft offline checks' }).click(); await held.entered;
    await page.getByRole('button', { name: 'Reset demo' }).click(); await expect(page.getByRole('status')).toContainText('Synthetic demo loaded'); await held.finish();
    await expect(page.getByText('EXACT GENERIC QUERY')).toHaveCount(0); await expect(page.getByText('Offline analyst checks', { exact: true })).toHaveCount(0);
  }
});
test('policy exception redirects a manual-discount check and missing/wrong-region context holds', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByLabel('Discount ceiling percent').fill('30'); await page.getByLabel('Shipping subsidy USD').fill('5'); await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.locator('.assumption-bar>small')).toContainText('Applied: 30%');
  await page.getByRole('button', { name: /^Findings/ }).click(); await page.getByLabel('Discount origin').selectOption('manual'); await page.getByRole('button', { name: 'Preview source fixtures' }).click();
  await expect(page.locator('.decision-status')).toHaveText('Initial settings fix contradicted'); await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
  await page.getByRole('button', { name: 'Draft offline checks' }).click(); await expect(page.locator('.remediation')).toContainText('Audit staff/manual POS');
  await page.locator('.policy-card').screenshot({ path: 'evidence/policy-manual-exception.png' });
  await page.getByLabel('Discount origin').selectOption('unknown'); await page.getByRole('button', { name: 'Preview source fixtures' }).click(); await expect(page.locator('.decision-status')).toHaveText('Hold · context needed');
  await page.getByLabel('Operating region').selectOption('UK'); await page.getByRole('button', { name: 'Preview source fixtures' }).click(); await expect(page.getByTestId('decision-next-check')).toContainText('Confirm the operating region');
});
test('a slower earlier import cannot overwrite a newer import', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  let ready!: () => void, release!: () => void, first = true;
  const entered = new Promise<void>(r => { ready = r; }), held = new Promise<void>(r => { release = r; });
  await page.route('**/api/analyze', async route => { if (!first) { await route.continue(); return; } first = false; const response = await route.fetch(); ready(); await held; await route.fulfill({ response }); });
  const template = await readFile('data/template.csv', 'utf8');
  const lines = template.trim().split('\n'); const earlier = `${lines[0]}\n${lines[1]}\n${lines[1].replace('MG-0001', 'MG-0002')}\n`;
  await page.getByLabel('Import order CSV').setInputFiles({ name: 'earlier.csv', mimeType: 'text/csv', buffer: Buffer.from(earlier) }); await entered;
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/template.csv')); await expect(page.locator('.dataset-strip')).toContainText('1 validated order');
  const done = page.waitForEvent('requestfinished', req => req.url().endsWith('/api/analyze')); release(); await done;
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('.dataset-strip')).toContainText('1 validated order'); await expect(page.locator('.dataset-strip')).not.toContainText('2 validated orders');
});

test('method text follows the applied seller assumptions and reset defaults', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByLabel('Discount ceiling percent').fill('30'); await page.getByLabel('Shipping subsidy USD').fill('5');
  await page.getByRole('button', { name: 'Recalculate' }).click(); await expect(page.locator('.assumption-bar>small')).toContainText('Applied: 30%');
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  const method = page.locator('.method-card');
  await expect(method).toContainText('discounts above 30%'); await expect(method).toContainText('$5.00 subsidy');
  await page.getByRole('button', { name: 'Load reproducible synthetic demo' }).click(); await expect(page.locator('.assumption-bar>small')).toContainText('Applied: 20%');
  await expect(method).toContainText('discounts above 20%'); await expect(method).toContainText('$3.00 subsidy');
});

test('a rejected latest drop prevents an older pending import from becoming current', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  const held = await holdResponse(page, '/api/analyze');
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/template.csv')); await held.entered;
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File(['wrong schema'], 'latest.txt', { type: 'text/plain' }));
    document.querySelector('.upload-zone')!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.getByRole('alert')).toContainText('Choose a .csv'); await held.finish();
  await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  await expect(page.getByRole('button', { name: 'Import CSV', exact: true })).toBeEnabled();
});

test('client-rejected files can be selected again after dismissing the error', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  for (const file of [{ name: 'repeat.txt', mimeType: 'text/plain', buffer: Buffer.from('wrong file') }, { name: 'repeat.csv', mimeType: 'text/csv', buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 'x') }]) {
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.getByLabel('Import order CSV').setInputFiles(file); await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByLabel('Import order CSV')).toHaveValue('');
      await page.getByRole('button', { name: 'Dismiss error' }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
    }
  }
});
