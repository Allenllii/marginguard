import { test, expect, type Page, type Route } from '@playwright/test';

// The /api/check-fix backend ships separately; every call here is mocked.
const shot = process.env.CF_SCREENSHOTS ? (page: Page, name: string) => page.screenshot({ path: `evidence/check-any-fix/${name}.png`, fullPage: true, animations: 'disabled' }) : async () => undefined;
const context = { platform: 'Shopify', carrier: 'USPS', region: 'US' } as const;
const examples = [
  { id: 'pos-stacking', fix: 'Tighten discount combination settings to stop staff discounts stacking', context },
  { id: 'returns-uk', fix: 'Refuse all refunds after 7 days to cut return costs', context: { platform: 'WooCommerce', carrier: 'UPS', region: 'UK' } },
];
const passage = 'For example, from a manual discount applied to a POS cart, or a unique discount on a draft order. The following discount types always apply to an order, regardless of any combination settings for other discounts on the same order: Custom discounts that are manually applied to an order.';
const quote = 'The following discount types always apply to an order, regardless of any combination settings for other discounts on the same order: Custom discounts that are manually applied to an order.';
const base = {
  mode: 'recorded', label: 'Recorded live run (Oct 30) replayed offline', claim: 'Shopify discount combination settings stop staff-applied custom discounts from stacking with other discounts.', topic: 'discounts',
  query: 'Shopify combining discounts manual custom discount POS', domain: 'help.shopify.com',
  sources: [{ id: 'S1', title: 'Combining discounts', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', passage }],
  quotes: [{ sourceId: 'S1', quote }], explanation: 'Shopify lists manually applied custom discounts as always applying, whatever the combination settings say.', nextCheck: 'Audit staff manual discounts in POS and on draft orders.', holdReason: null,
  retrieval: { steps: [{ op: 'search', requestId: 'tvly-search-8f2a91c4d7', credits: 1, latencyMs: 912, ok: true }, { op: 'extract', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', requestId: 'tvly-extract-55c0e1aa', credits: 1, latencyMs: 1430, ok: true }] },
  models: { plan: 'nvidia/Nemotron-3_5-Lightning', judge: 'nvidia/nemotron-3-super-120b-a12b' },
  proof: { planRequestId: 'chatcmpl-plan-1a2b3c4d', judgeRequestId: 'chatcmpl-judge-9z8y7x6w', inputTokens: 1840, outputTokens: 212, latencyMs: 3120 },
};
const results = {
  contradicted: { ...base, status: 'contradicted' },
  supported: { ...base, status: 'supported', claim: 'Shopify discount combination settings control whether automatic and code discounts combine.', quotes: [{ sourceId: 'S1', quote: 'The following discount types always apply to an order' }], explanation: 'For code and automatic discounts the combination settings are the documented control.', nextCheck: 'Review which discount classes may combine, then re-run the stacked-discount report.' },
  insufficient: { ...base, status: 'insufficient', quotes: [], explanation: 'The pages Tavily returned discuss discount classes but not staff-applied discounts.', nextCheck: 'Find the POS discount-permission page before changing settings.' },
  hold: { ...base, status: 'hold', claim: null, query: null, domain: null, sources: [], quotes: [], explanation: null, nextCheck: 'Confirm the operating region, then check again.', holdReason: 'Region is UK; MarginGuard only judges US policy pages today.', retrieval: null, models: { plan: 'nvidia/Nemotron-3_5-Lightning', judge: null }, proof: null },
} as const;
const verdicts = { supported: 'Supported', contradicted: 'Contradicted', insufficient: 'Not enough evidence', hold: 'On hold' } as const;
const health = (live: boolean) => ({ ok: true, provider: { mode: live ? 'configured' : 'fixture', model: 'mock/nemotron', endpoint: 'mock' }, tavily: { mode: live ? 'configured' : 'fixture', endpoint: 'mock' } });

async function setup(page: Page, { live = false, respond = (_route: Route) => _route.fulfill({ json: results.contradicted }) as Promise<void> } = {}) {
  const posts: { fix: string; context: unknown; live: boolean }[] = [];
  await page.route('**/api/health', route => route.fulfill({ json: health(live) }));
  await page.route('**/api/check-fix/examples', route => route.fulfill({ json: examples }));
  await page.route('**/api/check-fix', route => { posts.push(route.request().postDataJSON()); return respond(route); });
  return posts;
}
const open = async (page: Page) => { await page.goto('/#check'); await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check any fix against official policy.'); };
const noScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const status of ['contradicted', 'supported', 'insufficient', 'hold'] as const) test(`recorded ${status}: verdict, quotes, next check and provenance render; focus moves to the result`, async ({ page }) => {
  const posts = await setup(page, { respond: route => route.fulfill({ json: results[status] }) });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await expect(page.getByRole('button', { name: 'Check with Tavily + Nemotron' })).toHaveCount(0);
  await expect(page.getByText('Live checks need the live demo or your own keys.')).toBeVisible();
  await page.getByRole('button', { name: /^Tighten discount combination/ }).click();
  await expect(page.getByLabel('Proposed fix')).toHaveValue(examples[0].fix);
  await page.getByRole('button', { name: 'Show recorded check', exact: true }).click();
  const result = page.locator('.cf-result');
  await expect(page.getByTestId('cf-verdict')).toHaveText(verdicts[status]);
  await expect(page.locator('#cf-result-heading')).toBeFocused();
  await expect(page.getByTestId('cf-status')).toContainText(verdicts[status]);
  const r = results[status];
  await expect(result).toContainText(r.nextCheck);
  await expect(result).toContainText('Recorded live run (Oct 30) replayed offline');
  await expect(page.locator('.cf-quote')).toHaveCount(r.quotes.length);
  if (r.quotes.length) {
    await expect(page.locator('.cf-quote blockquote').first()).toHaveText(String(r.quotes[0]?.quote));
    await expect(page.locator('.cf-quote').first()).toContainText('Quote verified verbatim against the Tavily text');
    await expect(page.locator('.cf-quote a').first()).toHaveAttribute('href', base.sources[0].url);
  }
  if (r.holdReason) await expect(page.locator('.cf-hold')).toContainText(r.holdReason); else await expect(page.locator('.cf-hold')).toHaveCount(0);
  if (r.retrieval) await expect(result).toContainText('tvly-sea…');
  await expect(result).toContainText(`judge = ${r.models.judge ?? 'not run'}`);
  expect(posts).toEqual([{ fix: examples[0].fix, context, live: false }]);
  await shot(page, `${status}-1440`);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await noScroll(page)).toBe(true);
  await shot(page, `${status}-375`);
});

test('live mode: no POST without consent; consent sends live:true and the pipeline never claims completion while waiting', async ({ page }) => {
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  const posts = await setup(page, { live: true, respond: async route => { await held; await route.fulfill({ json: { ...results.contradicted, mode: 'live', label: 'Live' } }); } });
  await open(page);
  const liveButton = page.getByRole('button', { name: 'Check with Tavily + Nemotron', exact: true });
  await page.getByLabel('Proposed fix').fill('Offer free shipping on every order to lift conversion');
  await expect(liveButton).toBeDisabled();
  await page.getByLabel('Proposed fix').press('Enter');
  expect(posts).toEqual([]);
  await page.getByRole('checkbox', { name: /Send this fix text/ }).check();
  await liveButton.click();
  const progress = page.getByRole('region', { name: 'Check in progress' });
  await expect(progress).toContainText('Steps are confirmed when the response arrives.');
  await expect(progress.locator('.cf-stage')).toHaveCount(5);
  await expect(progress.locator('.cf-stage.done')).toHaveCount(0);
  await expect(page.getByTestId('cf-status')).toHaveText('Checking the fix against official policy…');
  await shot(page, 'progress-1440');
  release();
  await expect(page.getByTestId('cf-verdict')).toHaveText('Contradicted');
  await expect(progress).toHaveCount(0);
  await expect(page.locator('.cf-side .cf-stage.done')).toHaveCount(5);
  expect(posts).toEqual([{ fix: 'Offer free shipping on every order to lift conversion', context, live: true }]);
});

test('429 shows the server reason with the retry time and keeps the form', async ({ page }) => {
  const posts = await setup(page, { live: true, respond: route => route.fulfill({ status: 429, headers: { 'Retry-After': '12' }, json: { error: 'Wait before another live provider request.' } }) });
  await open(page);
  await page.getByRole('button', { name: /^Refuse all refunds/ }).click();
  await expect(page.getByLabel('Region', { exact: true })).toHaveValue('UK');
  await page.getByRole('checkbox', { name: /Send this fix text/ }).check();
  await page.getByRole('button', { name: 'Check with Tavily + Nemotron', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Wait before another live provider request. Try again in 12 s. Recorded examples still work.');
  await expect(page.getByLabel('Proposed fix')).toHaveValue(examples[1].fix);
  await expect(page.getByLabel('Platform', { exact: true })).toHaveValue('WooCommerce');
  await expect(page.getByRole('button', { name: 'Show recorded check', exact: true })).toBeEnabled();
  expect(posts[0]).toMatchObject({ live: true, context: examples[1].context });
  await shot(page, 'error-429-1440');
});

test('keyboard: type a fix, Tab to the recorded button, Enter runs it and focus lands on the verdict', async ({ page }) => {
  await setup(page);
  await open(page);
  await page.getByLabel('Proposed fix').focus();
  await page.keyboard.type('Tighten discount combination settings');
  await expect(page.locator('#cf-count')).toHaveText('37 / 240');
  for (let i = 0; i < 12 && !await page.getByRole('button', { name: 'Show recorded check', exact: true }).evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show recorded check', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#cf-result-heading')).toBeFocused();
  for (const target of await page.locator('.cf-chip, .cf-quote a, .cf-passage summary, .cf-result .limits summary').all()) expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(24);
});

test('#check route, nav item and overview entry; #preflight still opens the sandbox', async ({ page }) => {
  await setup(page);
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.locator('.cf-entry').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'evidence/check-any-fix/overview-entry-1440.png', animations: 'disabled' }).catch(() => undefined);
  await page.getByRole('button', { name: /^Got advice from an AI assistant\?/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check any fix against official policy.');
  expect(await page.evaluate(() => location.hash)).toBe('#check');
  await expect(page.locator('.sidebar').getByRole('button', { name: 'Check a fix', exact: true })).toHaveClass(/active/);
  await page.getByLabel('Proposed fix').fill('Keep this text');
  await page.locator('.sidebar').getByRole('button', { name: 'Overview', exact: true }).click();
  expect(await page.evaluate(() => location.hash)).toBe('');
  await page.locator('.sidebar').getByRole('button', { name: 'Check a fix', exact: true }).click();
  await expect(page.getByLabel('Proposed fix')).toHaveValue('Keep this text');
  await page.goto('/#preflight');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Collision-test a promotion');
  await page.evaluate(() => { location.hash = '#check'; });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check any fix against official policy.');
});

for (const width of [375, 320]) test(`${width}px: form and result fit without horizontal scroll`, async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width, height: 812 });
  await open(page);
  expect(await noScroll(page)).toBe(true);
  await page.getByRole('button', { name: /^Tighten discount combination/ }).click();
  await page.getByRole('button', { name: 'Show recorded check', exact: true }).click();
  await expect(page.getByTestId('cf-verdict')).toHaveText('Contradicted');
  await page.locator('.cf-passage summary').first().click();
  await page.locator('.cf-result .limits summary').click();
  expect(await noScroll(page)).toBe(true);
  if (width === 375) { await page.evaluate(() => scrollTo(0, 0)); await shot(page, 'form-375'); }
});
