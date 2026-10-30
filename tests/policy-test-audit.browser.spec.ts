import { test, expect, type Download, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ResearchPacket } from '../shared/types';

// Development regressions against a loopback-only synthetic fixture. This suite
// never enables a provider, executes a store change, or runs the final benchmark.
interface Audit {
  schemaVersion: string;
  exportedAt: string;
  fingerprints: { packetSha256: string; auditSha256: string };
  dataset: null | {
    fingerprint: { algorithm: string; value: string; hexCharacters: number; scope: string };
    synthetic: boolean; currency: string;
    sellerAssumptions: { discountCeilingPercent: number; shippingSubsidyCents: number };
    finding: { id: string; kind: string; exposureCents: number; rowIds: number[]; formula: string };
  };
  evidence: {
    mode: string; provenance: string; retrievedAt: string | null;
    reportedCheckedAt: string | null; status: string; researchId: string;
    context: ResearchPacket['context']; query: string; note: string;
    sources: ResearchPacket['sources']; proof: ResearchPacket['proof'] | null;
  };
  evaluation: {
    rulesetVersion: string; action: string; status: string; rejectedCandidates: number; notice: string;
    scenarios: {
      scenario: string; assumption: string; verdict: string; reason: string; holdReason: string | null;
      nextCheck: string; evidence: { sourceId: string; url: string; quote: string; ruleId: string }[];
      missingEvidence: string[];
    }[];
  };
}

const exportName = 'Download Policy-to-Test audit (JSON)';
const exportFilename = 'marginguard-policy-to-test-audit.json';

async function blockExternalRequests(page: Page, baseURL: string) {
  const origin = new URL(baseURL).origin;
  const blocked: string[] = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) {
      blocked.push(route.request().url());
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  return blocked;
}

async function openLab(page: Page) {
  await page.goto('/');
  await expect(page.locator('.dataset-strip')).toContainText('504 validated orders');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const lab = page.getByRole('region', { name: 'Policy-to-Test', exact: true });
  await expect(lab).toBeVisible();
  await expect(lab.getByRole('button', { name: exportName, exact: true })).toBeHidden();
  await lab.getByText('Advanced: audit details and JSON download', { exact: true }).click();
  await expect(lab.getByRole('button', { name: exportName, exact: true })).toBeVisible();
  return lab;
}

async function parseDownload(download: Download): Promise<Audit> {
  expect(download.suggestedFilename()).toBe(exportFilename);
  expect(await download.failure()).toBeNull();
  const file = await download.path();
  expect(file).not.toBeNull();
  return JSON.parse(await readFile(file!, 'utf8')) as Audit;
}

async function downloadAudit(page: Page, button: Locator) {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  return parseDownload(download);
}

function assertCommonAudit(audit: Audit) {
  expect(audit.schemaVersion).toBe('marginguard.policy-test-audit.v1');
  expect(new Date(audit.exportedAt).toISOString()).toBe(audit.exportedAt);
  expect(audit.fingerprints.packetSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(audit.fingerprints.auditSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(audit.evaluation.rulesetVersion.length).toBeGreaterThan(0);
  expect(audit.evaluation.scenarios.map(card => card.scenario)).toEqual(['normal', 'manual', 'unknown']);
  for (const card of audit.evaluation.scenarios) {
    expect(card.assumption.length).toBeGreaterThan(0);
    expect(card.reason.length).toBeGreaterThan(0);
    expect(card.nextCheck.length).toBeGreaterThan(0);
    expect(card.missingEvidence.length).toBeGreaterThan(0);
    if (card.verdict === 'hold') expect(card.holdReason).toBe(card.reason);
    for (const match of card.evidence) {
      const source = audit.evidence.sources.find(item => item.id === match.sourceId);
      expect(source).toBeDefined();
      expect(match.url).toBe(source!.url);
      expect(source!.snippet).toContain(match.quote);
    }
  }
}

test('audit download captures the current dataset, source provenance and all scenarios without a request', async ({ page, baseURL }) => {
  const blocked = await blockExternalRequests(page, baseURL!);
  const lab = await openLab(page);
  const button = lab.getByRole('button', { name: exportName, exact: true });
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));

  const first = await downloadAudit(page, button);
  assertCommonAudit(first);
  expect(first.dataset).not.toBeNull();
  expect(first.dataset!.fingerprint).toEqual({ algorithm: 'sha256', value: '0aca9bee505e7050', hexCharacters: 16, scope: 'original-csv-prefix' });
  expect(first.dataset!.synthetic).toBe(true);
  expect(first.dataset!.currency).toBe('USD');
  expect(first.dataset!.sellerAssumptions).toEqual({ discountCeilingPercent: 20, shippingSubsidyCents: 300 });
  expect(first.dataset!.finding.kind).toBe('discount');
  expect(first.dataset!.finding.id.length).toBeGreaterThan(0);
  expect(first.dataset!.finding.exposureCents).toBe(65808);
  expect(Number.isSafeInteger(first.dataset!.finding.exposureCents)).toBe(true);
  expect(first.dataset!.finding.rowIds).toHaveLength(28);
  expect(first.dataset!.finding.rowIds.every(Number.isSafeInteger)).toBe(true);
  expect(first.dataset!.finding.formula.length).toBeGreaterThan(0);
  expect(first.evidence.mode).toBe('fixture');
  expect(first.evidence.provenance).toMatch(/fixture|authored|offline/i);
  expect(first.evidence.retrievedAt).toBeNull();
  expect(first.evidence.reportedCheckedAt).toBeNull();
  expect(first.evidence.status).toBe('ok');
  expect(first.evidence.researchId.length).toBeGreaterThan(0);
  expect(first.evidence.context).toMatchObject({ platform: 'Shopify', region: 'US', discountOrigin: 'manual' });
  expect(first.evidence.query.length).toBeGreaterThan(0);
  expect(first.evidence.note.length).toBeGreaterThan(0);
  expect(first.evidence.sources.length).toBeGreaterThan(0);
  for (const source of first.evidence.sources) {
    expect(source).toEqual(expect.objectContaining({ id: expect.any(String), title: expect.any(String), url: expect.any(String), snippet: expect.any(String), publishedDate: null }));
    expect(Object.hasOwn(source, 'savedAt')).toBe(true);
    expect(Object.hasOwn(source, 'sourceRegion')).toBe(true);
  }
  expect(first.evaluation.action).toBe('review-combination-settings');
  expect(first.evaluation.scenarios.map(card => card.verdict)).toEqual(['hold', 'contradicted', 'hold']);
  expect(first.evaluation.notice).toMatch(/synthetic|counterfactual/i);
  expect(first.evaluation.notice).toMatch(/recovery/i);

  await lab.getByLabel('Choose the repair to challenge', { exact: true }).selectOption('audit-manual-overrides');
  const second = await downloadAudit(page, button);
  assertCommonAudit(second);
  expect(second.evaluation.action).toBe('audit-manual-overrides');
  expect(second.evaluation.scenarios.map(card => card.verdict)).toEqual(['hold', 'supported', 'hold']);
  expect(second.fingerprints.packetSha256).toBe(first.fingerprints.packetSha256);
  expect(second.fingerprints.auditSha256).not.toBe(first.fingerprints.auditSha256);
  expect(second.dataset).toEqual(first.dataset);
  expect(second.evidence).toEqual(first.evidence);
  await expect(lab.getByRole('status')).toHaveCount(1);
  await expect(lab.getByRole('status')).toContainText('2 on hold');
  await expect(lab.getByRole('status')).toContainText(/download|export/i);
  expect(requests).toEqual([]);
  expect(blocked).toEqual([]);
});

test('a failed live-labelled packet exports all HOLD reasons without creating retrieved evidence', async ({ page, baseURL }) => {
  const blocked = await blockExternalRequests(page, baseURL!);
  const reportedCheckedAt = '2026-10-29T20:00:00.000Z';
  const failed: ResearchPacket = {
    researchId: 'offline-browser-failed-live-packet', kind: 'discount', mode: 'live', status: 'error',
    context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' },
    query: 'Synthetic generic policy query; no provider called', checkedAt: reportedCheckedAt,
    note: 'Authored failed-packet regression. No current retrieval or live request occurred.', sources: [],
  };
  await page.route('**/api/research', route => route.fulfill({ json: failed }));
  const lab = await openLab(page);
  await expect(lab.locator('.ptl-hold')).toHaveCount(3);
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const audit = await downloadAudit(page, lab.getByRole('button', { name: exportName, exact: true }));
  assertCommonAudit(audit);
  expect(audit.evidence.mode).toBe('live');
  expect(audit.evidence.provenance).toMatch(/unverified|not authenticated|not.*authenticity|caller/i);
  expect(audit.evidence.status).toBe('error');
  expect(audit.evidence.researchId).toBe(failed.researchId);
  expect(audit.evidence.reportedCheckedAt).toBe(reportedCheckedAt);
  expect(audit.evidence.retrievedAt).toBeNull();
  expect(audit.evidence.sources).toEqual([]);
  expect(audit.evidence.proof).toBeNull();
  expect(audit.evaluation.status).toBe('hold');
  expect(audit.evaluation.scenarios.every(card => card.verdict === 'hold' && card.evidence.length === 0)).toBe(true);
  expect(audit.evaluation.notice).toMatch(/failed|unusable|no matching/i);
  expect(requests).toEqual([]);
  expect(blocked).toEqual([]);
});

test('audit export has a described keyboard target and stays within the 320px offline layout', async ({ page, baseURL }) => {
  const blocked = await blockExternalRequests(page, baseURL!);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const lab = await openLab(page);
  const button = lab.getByRole('button', { name: exportName, exact: true });
  await expect(button).toHaveAccessibleDescription(/local/i);
  await expect(button).toHaveAccessibleDescription(/retriev/i);
  expect(await button.getAttribute('aria-describedby')).toBeTruthy();
  expect(await button.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await lab.getByLabel('Choose the repair to challenge', { exact: true }).focus();
  for (let index = 0; index < 20; index++) {
    await page.keyboard.press('Tab');
    if (await button.evaluate(element => element === document.activeElement)) break;
  }
  await expect(button).toBeFocused();
  const focus = await button.evaluate(element => {
    const style = getComputedStyle(element);
    return { visible: element.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
  });
  expect(focus.visible).toBe(true);
  expect(focus.style).toBe('solid');
  expect(focus.width).toBeGreaterThanOrEqual(3);
  await page.waitForLoadState('networkidle');
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  assertCommonAudit(await parseDownload(download));
  await expect(button).toBeFocused();
  await expect(lab.getByRole('status')).toHaveCount(1);
  await expect(lab.getByRole('status')).toContainText(/download|export/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const moving = await lab.locator('*').evaluateAll(elements => elements.filter(element => {
    const style = getComputedStyle(element);
    return style.animationName !== 'none' || style.transitionDuration.split(',').some(duration => parseFloat(duration) > 0);
  }).length);
  expect(moving).toBe(0);
  expect(requests).toEqual([]);
  expect(blocked).toEqual([]);
});
