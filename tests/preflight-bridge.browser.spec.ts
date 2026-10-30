import { test, expect, type Page, type Route } from '@playwright/test';
import { runPreflight } from '../shared/preflight';
import { readFile } from 'node:fs/promises';

// All provider-looking replies below are routed synthetic fixtures. These tests
// never contact Tavily/Nebius and are not evidence of an actual sponsor call.
const model = 'nvidia/Nemotron-3_5-Lightning';
const policyUrl = 'https://help.shopify.com/en/manual/discounts/discount-combinations';
const campaign = '20% product discount then 20% order discount then free shipping';
const reviewLabel = 'I reviewed these rules and approve a simulation only';
const rules = [
  { id: 'R1', minSubtotalCents: 0, minItems: 0, type: 'percent', scope: 'product', basisPoints: 2000 },
  { id: 'R2', minSubtotalCents: 0, minItems: 0, type: 'percent', scope: 'order', basisPoints: 2000 },
  { id: 'R3', minSubtotalCents: 0, minItems: 0, type: 'free_shipping' },
];
const configuredHealth = {
  ok: true,
  provider: { mode: 'configured', model, endpoint: 'https://api.tokenfactory.nebius.com/v1/' },
  tavily: { mode: 'configured', endpoint: 'https://api.tavily.com/search' },
  limits: { daily: 20, total: 100, minute: 2, scope: 'process lifetime', liveSafe: true, enabledUntil: '2026-12-16T00:00:00.000Z' },
};
function proposal(url = policyUrl) {
  return {
    mode: 'live', status: 'NEEDS_CONFIRMATION', reason: 'MOCK_LIVE_PREPARED_RULES', rules: structuredClone(rules),
    policy: { mode: 'live', status: 'REFERENCE_READY', reason: 'Synthetic routed policy response for this test only.', sources: [
      { id: 'S1', title: 'Combining discounts', url, snippet: 'Eligible discounts can combine when combination settings on each discount permit the combination. Verify store eligibility before testing.' },
    ] },
    model, requiresSellerConfirmation: true, applyAutomatically: false, checkoutVerified: false,
    http: { maximumAttempts: 4, attempted: 4, blocked: false, unknownOutcomes: 0, traces: [
      { endpoint: 'search', provider: 'tavily', outcome: 'response', status: 200 },
      { endpoint: 'extract', provider: 'tavily', outcome: 'response', status: 200 },
      { endpoint: 'models', provider: 'nebius', outcome: 'response', status: 200 },
      { endpoint: 'completion', provider: 'nebius', outcome: 'response', status: 200 },
    ] },
    proposalId: '00000000-0000-4000-8000-000000000123', proposalTtlSeconds: 600,
  };
}
function held(reason: string) {
  return { ...proposal(), status: 'HOLD', reason, rules: [], policy: null, model: null, proposalId: null, proposalTtlSeconds: null,
    http: { maximumAttempts: 4, attempted: 0, blocked: true, unknownOutcomes: 0, traces: [] } };
}
const fulfill = (route: Route, value: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
const prepareButton = (page: Page) => page.getByRole('button', { name: 'Prepare with Tavily and NVIDIA', exact: true });
const confirmButton = (page: Page) => page.getByRole('button', { name: 'Confirm proposed rules', exact: true });
const receipt = (page: Page) => page.getByTestId('preflight-bridge-provenance');

async function openBridge(page: Page) {
  await page.goto('/#preflight');
  const panel = page.locator('details.pf-bridge');
  if (await panel.getAttribute('open') === null) await page.getByText('Review a campaign with policy evidence', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Preview synthetic proposal', exact: true })).toBeVisible();
}
async function allowLive(page: Page) {
  await page.getByRole('button', { name: 'Check live availability', exact: true }).click();
  await expect(page.getByText('Local live configuration is available. No provider call has been made.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Campaign description', exact: true }).fill(campaign);
  await page.getByRole('checkbox', { name: 'Shopify, US, automatic/code discounts', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Allow one live preparation using credits', exact: true }).check();
  await expect(prepareButton(page)).toBeEnabled();
}
async function ignoreAbortForGenerationTest(page: Page) {
  // Prove stale-generation handling even if a transport ignores cancellation.
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => realFetch(input, { ...init, signal: undefined });
  });
}
async function renderFrame(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
}
type MockOptions = { prepare?: (route: Route) => Promise<void>; confirm?: (route: Route) => Promise<void>; health?: unknown };
async function mockBackend(page: Page, options: MockOptions = {}) {
  const preparations: Record<string, unknown>[] = [], confirmations: Record<string, unknown>[] = [], urls: string[] = [];
  page.on('request', request => urls.push(request.url()));
  await page.route('**/api/health', route => fulfill(route, options.health ?? configuredHealth));
  await page.route('**/api/preflight/prepare', async route => {
    preparations.push(route.request().postDataJSON());
    if (options.prepare) await options.prepare(route); else await fulfill(route, proposal());
  });
  await page.route('**/api/preflight/confirm', async route => {
    const request = route.request().postDataJSON(); confirmations.push(request);
    if (options.confirm) { await options.confirm(route); return; }
    const simulation = runPreflight(request.input);
    await fulfill(route, { mode: 'offline', status: simulation.status, simulation, sellerConfirmed: true, providerRequests: 0,
      checkoutStatus: 'HOLD', checkoutVerified: false, note: 'Synthetic routed confirmation; integer engine only.' });
  });
  return { preparations, confirmations, urls };
}
async function noEnabledConfirmation(page: Page) {
  const review = page.getByRole('checkbox', { name: reviewLabel, exact: true });
  if (await review.count() && await review.isEnabled()) await review.check();
  if (await confirmButton(page).count()) await expect(confirmButton(page)).toBeDisabled();
  await expect(page.getByTestId('preflight-worst-contribution')).toHaveCount(0);
  await expect(receipt(page)).toHaveCount(0);
}
function delayedReply() {
  let enter!: () => void, release!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  return { entered, release, finished, prepare: async (route: Route) => {
    enter(); await pending;
    try { await fulfill(route, proposal()); } catch { /* An explicit UI abort can close this mock route. */ }
    finally { finish(); }
  } };
}

test('bridge fixture: zero API requests and explicit review precede a synthetic simulation', async ({ page }) => {
  const urls: string[] = []; page.on('request', request => urls.push(request.url()));
  await openBridge(page);
  await page.getByRole('textbox', { name: 'Campaign description', exact: true }).fill('Unparsed seller prose');
  await page.getByRole('button', { name: 'Preview synthetic proposal', exact: true }).click();
  await expect(page.getByText('Offline synthetic proposal', { exact: false })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Campaign description', exact: true })).toHaveValue(campaign);
  await expect(confirmButton(page)).toBeDisabled();
  await expect(page.getByTestId('preflight-worst-contribution')).toHaveCount(0);
  await page.getByRole('checkbox', { name: reviewLabel, exact: true }).check();
  await confirmButton(page).click();
  await expect(page.getByTestId('preflight-worst-contribution')).toHaveText('-$6.00');
  await expect(page.getByTestId('preflight-status')).toHaveText('HOLD');
  await expect(receipt(page)).toContainText(/fixture|offline/i);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download JSON audit', exact: true }).click();
  const saved = await download, exported = JSON.parse(await readFile((await saved.path())!, 'utf8'));
  expect(exported.bridge.mode).toBe('fixture'); expect(exported.bridge.model).toBeNull();
  expect(exported.bridge.providerAttempts).toBe(0); expect(exported.fullStackTrace.contributionCents).toBe(-600);
  expect(exported.bridge.boundary).toContain('checkout remain unverified');
  await page.screenshot({ path: test.info().outputPath('bridge-fixture-confirmed.png'), fullPage: true });
  expect(urls.filter(url => url.includes('/api/'))).toEqual([]);
  expect(urls.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

test('bridge mocked live: one prepare and explicit confirmation send separate minimal envelopes', async ({ page }) => {
  const delayed = delayedReply(); const mock = await mockBackend(page, { prepare: delayed.prepare });
  await openBridge(page); await allowLive(page);
  await prepareButton(page).click(); await delayed.entered;
  await expect(prepareButton(page)).toBeDisabled();
  expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(0);
  delayed.release(); await delayed.finished;
  await expect(page.getByText('Live server response · NEEDS_CONFIRMATION', { exact: false })).toBeVisible();
  await expect(confirmButton(page)).toBeDisabled();
  expect(Object.keys(mock.preparations[0]).sort()).toEqual(['activity', 'context', 'live']);
  expect(mock.preparations[0]).toEqual({ activity: campaign, context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'native' }, live: true });
  expect(JSON.stringify(mock.preparations)).not.toMatch(/DEMO-SKU|5000|3000|priceCents|unitCostCents|costsReference|csv/i);
  await page.getByRole('checkbox', { name: reviewLabel, exact: true }).check(); await confirmButton(page).click();
  await expect(receipt(page)).toContainText(/live/i);
  await expect(page.getByTestId('preflight-worst-contribution')).toHaveText('-$6.00');
  await expect(page.getByTestId('preflight-status')).toHaveText('HOLD');
  expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(1);
  expect(mock.confirmations[0].confirmed).toBe(true);
  expect(mock.confirmations[0].proposalId).toBe(proposal().proposalId);
  const input = mock.confirmations[0].input as { rules: unknown; skus: { priceCents: number }[] };
  expect(input.rules).toEqual(rules); expect(input.skus[0].priceCents).toBe(5000);
  expect(mock.urls.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
});

test('bridge mocked budget HOLD consumes consent without hidden retry or automatic confirmation', async ({ page }) => {
  const mock = await mockBackend(page, { prepare: route => fulfill(route, held('MOCK_BUDGET_HOLD'), 429) });
  await openBridge(page); await allowLive(page); await prepareButton(page).click();
  await expect(page.getByText('MOCK_BUDGET_HOLD', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Allow one live preparation using credits', exact: true })).not.toBeChecked();
  await expect(prepareButton(page)).toBeDisabled(); await noEnabledConfirmation(page);
  expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(0);
});

test('bridge mocked no-evidence HOLD never becomes a proposal or silently substitutes fixtures', async ({ page }) => {
  const stopped = { ...held('MOCK_NO_POLICY_EVIDENCE'), http: { ...proposal().http, attempted: 2, traces: proposal().http.traces.slice(0, 2) } };
  const mock = await mockBackend(page, { prepare: route => fulfill(route, stopped) });
  await openBridge(page); await allowLive(page); await prepareButton(page).click();
  await expect(page.getByText('MOCK_NO_POLICY_EVIDENCE', { exact: false })).toBeVisible();
  await expect(page.getByText('Offline synthetic proposal', { exact: false })).toHaveCount(0);
  await noEnabledConfirmation(page);
  expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(0);
});

test('bridge mocked diagnostics preserve the exact static HOLD code without exposing source data', async ({ page }) => {
  const stopped = { ...held('[EXTRACT_SCOPED_CONTRADICTION] Evidence did not pass the policy checks.'),
    http: { ...proposal().http, attempted: 2, traces: proposal().http.traces.slice(0, 2) } };
  const mock = await mockBackend(page, { prepare: route => fulfill(route, stopped) });
  await openBridge(page); await allowLive(page); await prepareButton(page).click();
  await expect(page.getByText('[EXTRACT_SCOPED_CONTRADICTION]', { exact: false })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Proposed campaign rules', exact: true })).toHaveCount(0);
  await noEnabledConfirmation(page);
  expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(0);
});

test('bridge mocked delayed confirmation cannot display old money after a cost edit', async ({ page }) => {
  await ignoreAbortForGenerationTest(page);
  let enter!: () => void, release!: () => void, finish!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const finished = new Promise<void>(resolve => { finish = resolve; });
  const mock = await mockBackend(page, { confirm: async route => {
    const simulation = runPreflight(route.request().postDataJSON().input);
    enter(); await pending;
    try { await fulfill(route, { mode: 'offline', status: simulation.status, simulation, sellerConfirmed: true, providerRequests: 0,
      checkoutStatus: 'HOLD', checkoutVerified: false, note: 'Synthetic delayed confirmation only.' }); }
    catch { /* Explicit edit invalidates the pending browser request. */ }
    finally { finish(); }
  } });
  await openBridge(page); await allowLive(page); await prepareButton(page).click();
  await expect(page.getByText('Live server response · NEEDS_CONFIRMATION', { exact: false })).toBeVisible();
  const received = page.waitForResponse(response => response.url().endsWith('/api/preflight/confirm'));
  await page.getByRole('checkbox', { name: reviewLabel, exact: true }).check(); await confirmButton(page).click(); await entered;
  await page.getByLabel('SKU 1 price (cents)', { exact: true }).fill('5100');
  release(); await finished; await (await received).finished(); await renderFrame(page);
  await expect(page.getByTestId('preflight-worst-contribution')).toHaveCount(0);
  await expect(receipt(page)).toHaveCount(0); expect(mock.confirmations).toHaveLength(1);
});

for (const invalidate of ['cancel', 'cost edit'] as const) test(`bridge mocked delayed prepare: ${invalidate} invalidates its response`, async ({ page }) => {
  await ignoreAbortForGenerationTest(page);
  const delayed = delayedReply(); const mock = await mockBackend(page, { prepare: delayed.prepare });
  await openBridge(page); await allowLive(page);
  const received = page.waitForResponse(response => response.url().endsWith('/api/preflight/prepare'));
  await prepareButton(page).click(); await delayed.entered;
  if (invalidate === 'cancel') await page.getByRole('button', { name: 'Cancel preparation', exact: true }).click();
  else await page.getByLabel('SKU 1 price (cents)', { exact: true }).fill('5100');
  delayed.release(); await delayed.finished; await (await received).finished(); await renderFrame(page);
  await expect(page.getByText('Live server response · NEEDS_CONFIRMATION', { exact: false })).toHaveCount(0);
  await expect(receipt(page)).toHaveCount(0); expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(0);
});

test('bridge mocked delayed prepare: inactive workspace cannot restore a proposal after browser navigation', async ({ page }) => {
  await ignoreAbortForGenerationTest(page);
  const delayed = delayedReply(); const mock = await mockBackend(page, { prepare: delayed.prepare });
  await openBridge(page); await allowLive(page);
  const received = page.waitForResponse(response => response.url().endsWith('/api/preflight/prepare'));
  await prepareButton(page).click(); await delayed.entered;
  await page.getByRole('link', { name: /Back to analysis/ }).click();
  await expect(page.getByText('504 validated orders', { exact: false })).toBeVisible();
  delayed.release(); await delayed.finished; await (await received).finished(); await renderFrame(page);
  await page.getByRole('link', { name: 'Promo Preflight', exact: true }).click();
  await expect(page.getByText('Live server response · NEEDS_CONFIRMATION', { exact: false })).toHaveCount(0);
  await expect(receipt(page)).toHaveCount(0); expect(mock.preparations).toHaveLength(1); expect(mock.confirmations).toHaveLength(0);
});

test('bridge mocked unsafe source URLs cannot create a confirmable proposal or executable link', async ({ page }) => {
  for (const url of ['javascript:alert(1)', 'https://help.shopify.com.evil.example/policy']) {
    const mock = await mockBackend(page, { prepare: route => fulfill(route, proposal(url)) });
    await openBridge(page); await allowLive(page); await prepareButton(page).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await noEnabledConfirmation(page);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('a[href*="help.shopify.com.evil.example"]')).toHaveCount(0);
    expect(mock.confirmations).toHaveLength(0);
    await page.unroute('**/api/health'); await page.unroute('**/api/preflight/prepare'); await page.unroute('**/api/preflight/confirm');
  }
});

test('bridge no-key mode: checking availability cannot enable a live preparation', async ({ page }) => {
  const health = { ...configuredHealth, provider: { ...configuredHealth.provider, mode: 'fixture' }, tavily: { ...configuredHealth.tavily, mode: 'fixture' } };
  const mock = await mockBackend(page, { health }); await openBridge(page);
  await page.getByRole('button', { name: 'Check live availability', exact: true }).click();
  await expect(page.getByText('Live providers are unavailable. Use the clearly labeled synthetic proposal.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Campaign description', exact: true }).fill(campaign);
  const context = page.getByRole('checkbox', { name: 'Shopify, US, automatic/code discounts', exact: true });
  if (await context.isEnabled()) await context.check();
  const consent = page.getByRole('checkbox', { name: 'Allow one live preparation using credits', exact: true });
  if (await consent.isEnabled()) await consent.check();
  await expect(prepareButton(page)).toBeDisabled();
  expect(mock.preparations).toHaveLength(0); expect(mock.confirmations).toHaveLength(0);
});

test('bridge fixture at 320px: keyboard confirmation and reduced motion retain readable bounded layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#preflight');
  const toggle = page.getByText('Review a campaign with policy evidence', { exact: true });
  await toggle.focus(); await page.keyboard.press('Enter');
  const preview = page.getByRole('button', { name: 'Preview synthetic proposal', exact: true });
  await preview.focus(); await page.keyboard.press('Enter');
  await expect(confirmButton(page)).toBeDisabled();
  await page.getByRole('checkbox', { name: reviewLabel, exact: true }).focus(); await page.keyboard.press('Space');
  await confirmButton(page).focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('preflight-worst-contribution')).toHaveText('-$6.00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await expect(page.getByRole('region', { name: 'What is left in the worst basket?', exact: true })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('bridge-fixture-320.png'), fullPage: true });
});
