import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SYNTHETIC_MAPPING_CSV, buildMappedCsv, readMappingCsv, suggestMapping } from '../shared/csv-mapping';

async function openMapper(page: Page) {
  await page.goto('/');
  await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  if (await page.getByRole('button', { name: 'Toggle navigation', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  return page.getByRole('region', { name: 'Different column names? Map your CSV.', exact: true });
}

async function reviewExclusions(mapper: Locator) {
  for (const checkbox of await mapper.getByRole('checkbox', { name: /^Exclude column/ }).all()) await checkbox.check();
}

for (const width of [1440, 320]) test(`CSV mapper ${width}px: keyboard preview, private-column exclusion, download and server import`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const mapper = await openMapper(page);
  const requests: { path: string; body: string }[] = [];
  page.on('request', request => { if (request.method() === 'POST') requests.push({ path: new URL(request.url()).pathname, body: request.postData() ?? '' }); });
  const example = mapper.getByRole('button', { name: 'Try synthetic mapping example', exact: true });
  await example.focus(); await page.keyboard.press('Enter');
  await expect(mapper.getByRole('heading', { name: 'Synthetic example: 2 order rows', exact: true })).toBeFocused();
  await expect(mapper.getByRole('combobox')).toHaveCount(12);
  expect(await mapper.getByRole('combobox').evaluateAll(nodes => nodes.every(node => Boolean((node as HTMLSelectElement).labels?.length)))).toBe(true);
  await expect(mapper).toContainText('Excluded columns (1): Customer email');
  const validate = mapper.getByRole('button', { name: 'Validate mapped CSV locally', exact: true });
  await expect(validate).toBeDisabled();
  const consent = mapper.getByRole('checkbox', { name: /^I checked the field meanings/ });
  await expect(consent).toBeDisabled();
  await expect(mapper).not.toContainText('synthetic@example.com');
  await reviewExclusions(mapper);
  await consent.focus(); await page.keyboard.press('Space'); await page.keyboard.press('Tab');
  await expect(validate).toBeFocused(); await page.keyboard.press('Enter');
  await expect(mapper.getByRole('status')).toBeFocused();
  await expect(mapper.getByRole('status')).toContainText('2 mapped order rows passed local schema validation');
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const downloadEvent = page.waitForEvent('download');
  await mapper.getByRole('button', { name: 'Download mapped CSV', exact: true }).click();
  const downloaded = await downloadEvent;
  const downloadPath = testInfo.outputPath('mapped-orders.csv'); await downloaded.saveAs(downloadPath);
  const csv = await readFile(downloadPath, 'utf8');
  expect(csv).not.toContain('Customer email'); expect(csv).not.toContain('synthetic@example.com');
  expect(csv).toContain('100.00,30.00,2,35.00,5.00,10.00,0.00,0.00');
  await mapper.screenshot({ path: `evidence/csv-mapping-${width}.png`, animations: 'disabled' });
  await mapper.getByRole('button', { name: 'Analyze mapped CSV', exact: true }).click();
  await expect(page.locator('.dataset-strip')).toContainText('2 validated orders');
  expect(requests).toHaveLength(1); expect(requests[0].path).toBe('/api/analyze');
  expect(JSON.parse(requests[0].body).csv).toBe(csv);
  await expect(page.getByRole('status')).toContainText('Imported 2 validated orders');
  await expect(page.getByRole('status')).toContainText('Synthetic CSV mapping example; not merchant data.');
  const reportEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report', exact: true }).click();
  const report = await reportEvent;
  const reportPath = testInfo.outputPath('synthetic-report.md'); await report.saveAs(reportPath);
  expect(await readFile(reportPath, 'utf8')).toContain('Synthetic: true');
});

test('CSV mapper: duplicate mapping and changed selections revoke confirmation and validation', async ({ page }) => {
  const mapper = await openMapper(page);
  await mapper.getByRole('button', { name: 'Try synthetic mapping example', exact: true }).click();
  const confirm = mapper.getByRole('checkbox', { name: /^I checked the field meanings/ });
  await reviewExclusions(mapper); await confirm.check();
  await mapper.getByRole('button', { name: 'Validate mapped CSV locally', exact: true }).click();
  await mapper.getByRole('checkbox', { name: /^Exclude column/ }).uncheck();
  await expect(confirm).not.toBeChecked(); await expect(confirm).toBeDisabled();
  await expect(mapper.getByRole('button', { name: 'Analyze mapped CSV', exact: true })).toHaveCount(0);
  await reviewExclusions(mapper); await confirm.check();
  await mapper.getByRole('button', { name: 'Validate mapped CSV locally', exact: true }).click();
  await mapper.getByRole('combobox').nth(7).selectOption('4');
  await expect(mapper).toContainText('each source column can be used once');
  await expect(confirm).not.toBeChecked(); await expect(confirm).toBeDisabled();
  await expect(mapper.getByRole('button', { name: 'Analyze mapped CSV', exact: true })).toHaveCount(0);
  await mapper.getByRole('combobox').nth(7).selectOption('7');
  await expect(confirm).toBeDisabled(); await reviewExclusions(mapper); await expect(confirm).toBeEnabled();
  await expect(mapper.getByRole('button', { name: 'Validate mapped CSV locally', exact: true })).toBeDisabled();
});

test('CSV mapper: invalid dates and duplicate orders are blocked locally without replacing the dataset', async ({ page }) => {
  const mapper = await openMapper(page);
  const posts: string[] = []; page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  const lines = SYNTHETIC_MAPPING_CSV.split('\n');
  for (const [csv, expectedError] of [
    [SYNTHETIC_MAPPING_CSV.replace('2026-09-27', '2026-02-30'), 'real ISO date'],
    [[lines[0], lines[1], lines[1]].join('\n'), 'order_id must be unique'],
  ]) {
    await mapper.getByLabel('Choose CSV to map').setInputFiles({ name: 'synthetic-invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await reviewExclusions(mapper); await mapper.getByRole('checkbox', { name: /^I checked the field meanings/ }).check();
    await mapper.getByRole('button', { name: 'Validate mapped CSV locally', exact: true }).click();
    await expect(mapper.getByRole('alert')).toContainText(expectedError);
    await expect(mapper.getByRole('button', { name: 'Download mapped CSV', exact: true })).toHaveCount(0);
  }
  expect(posts).toEqual([]); await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  await mapper.getByRole('button', { name: 'Clear mapping', exact: true }).click();
  await expect(mapper.getByLabel('Choose CSV to map')).toBeFocused();
  await expect(mapper.getByRole('combobox')).toHaveCount(0);
});

test('CSV mapper: recalculation retains known synthetic provenance while a fresh file import uses its own provenance', async ({ page }, testInfo) => {
  const mapper = await openMapper(page);
  await mapper.getByRole('button', { name: 'Try synthetic mapping example', exact: true }).click();
  await reviewExclusions(mapper); await mapper.getByRole('checkbox', { name: /^I checked the field meanings/ }).check();
  await mapper.getByRole('button', { name: 'Validate mapped CSV locally', exact: true }).click();
  await mapper.getByRole('button', { name: 'Analyze mapped CSV', exact: true }).click();
  await expect(page.locator('.dataset-strip')).toContainText('2 validated orders');
  await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Seller assumptions applied');
  const readReport = async (name: string) => {
    const event = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export report', exact: true }).click();
    const report = await event; const dest = testInfo.outputPath(name); await report.saveAs(dest);
    return readFile(dest, 'utf8');
  };
  const syntheticReport = await readReport('recalculated-synthetic-report.md');
  expect(syntheticReport).toContain('Synthetic: true');
  expect(syntheticReport).toContain('Source: Synthetic CSV mapping example');
  const parsed = readMappingCsv(SYNTHETIC_MAPPING_CSV);
  const mapped = buildMappedCsv(parsed, suggestMapping(parsed.headers));
  await page.getByLabel('Import order CSV').setInputFiles({ name: 'seller-provided.csv', mimeType: 'text/csv', buffer: Buffer.from(mapped) });
  await expect(page.getByRole('status')).toContainText('Imported 2 validated orders');
  const uploadedReport = await readReport('fresh-file-report.md');
  expect(uploadedReport).toContain('Synthetic: false');
  expect(uploadedReport).toContain('Source: Imported CSV');
});
