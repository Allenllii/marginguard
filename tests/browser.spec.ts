import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { ResearchPacket } from '../shared/types';

// Measure rendered text, compositing translucent ancestors and checking gradient endpoints.
// This is a bounded regression for these synthetic pages, not a full WCAG certification.
async function textContrast(page: Page) {
  return page.evaluate(() => {
    type Color = [number, number, number, number];
    const parse = (raw: string): Color => {
      const v = raw.match(/[\d.]+/g)?.map(Number) || [];
      return [v[0] || 0, v[1] || 0, v[2] || 0, v[3] ?? 1];
    };
    const over = (front: Color, back: Color): Color => {
      const a = front[3] + back[3] * (1 - front[3]);
      return [0, 1, 2].map(i => (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) / a).concat(a) as Color;
    };
    const luminance = (color: Color) => {
      const c = color.slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
      return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
    };
    const root = document.querySelector('[role="dialog"]') || document.body;
    return Array.from(root.querySelectorAll('*')).flatMap(node => {
      if (node.closest('script,style,option,[aria-hidden="true"],:disabled') || !Array.from(node.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) return [];
      const style = getComputedStyle(node), rect = node.getBoundingClientRect();
      if (style.visibility !== 'visible' || style.display === 'none' || !rect.width || !rect.height || rect.right <= 0 || rect.left >= innerWidth) return [];
      const chain: Element[] = []; for (let n: Element | null = node; n; n = n.parentElement) chain.unshift(n);
      let backgrounds: Color[] = [[255, 255, 255, 1]], opacity = 1;
      for (const ancestor of chain) {
        const s = getComputedStyle(ancestor); opacity *= Number(s.opacity);
        const bg = parse(s.backgroundColor); backgrounds = backgrounds.map(b => over(bg, b));
        if (bg[3] === 1) backgrounds = [backgrounds[0]];
        const stops = s.backgroundImage.match(/rgba?\([^)]*\)/g);
        if (stops) backgrounds = backgrounds.flatMap(b => stops.map(stop => over(parse(stop), b)));
      }
      if (!opacity) return [];
      const foreground = parse(node.tagName.toLowerCase() === 'text' ? style.fill : style.color); foreground[3] *= opacity;
      const ratios = backgrounds.map(b => { const a = luminance(over(foreground, b)), c = luminance(b); return (Math.max(a, c) + .05) / (Math.min(a, c) + .05); });
      const ratio = Math.min(...ratios), size = parseFloat(style.fontSize);
      const minimum = size >= 24 || (size >= 18.6667 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      return [{ text: node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80), selector: `${node.tagName.toLowerCase()}.${Array.from(node.classList).join('.')}`, foreground: node.tagName.toLowerCase() === 'text' ? style.fill : style.color, backgrounds, ratio, minimum, size }];
    });
  });
}

for (const width of [1280, 393]) test(`contrast: ${width}px auxiliary text across the full fixture journey meets minimum ratios`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  const groups: { view: string; measurements: Awaited<ReturnType<typeof textContrast>> }[] = [];
  const measure = async (view: string) => groups.push({ view, measurements: await textContrast(page) });
  const nav = async (name: string) => {
    const button = page.locator('.sidebar').getByRole('button', { name: new RegExp(`^${name}`) });
    if (!await button.isVisible()) await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
    await button.click();
  };
  await measure('overview');
  await page.getByRole('button', { name: 'Recalculate', exact: true }).click();
  await expect(page.locator('.alert.notice')).toBeVisible(); await measure('notice');
  await nav('Findings'); await measure('findings');
  await page.getByRole('button', { name: 'Generate offline brief', exact: true }).click();
  await expect(page.locator('.brief-result').getByText('No model called', { exact: true })).toBeVisible(); await measure('offline-brief');
  await page.getByLabel('Discount origin').selectOption('manual');
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
  for (const summary of await page.locator('.policy-source summary').all()) await summary.click();
  await page.getByRole('button', { name: 'Show recorded Nemotron draft', exact: true }).click();
  await expect(page.locator('.remediation')).toBeVisible(); await measure('policy-expanded');
  await page.locator('.decision-card').screenshot({ path: `evidence/contrast-decision-${width}.png`, animations: 'disabled' });
  await nav('Scenario lab'); await measure('scenarios');
  await nav('Data & method'); await measure('data');
  await nav('Overview'); await page.locator('.finding-row').first().click();
  await expect(page.getByRole('dialog')).toBeVisible(); await measure('evidence-drawer');
  await page.screenshot({ path: `evidence/contrast-drawer-${width}.png`, animations: 'disabled' });
  await page.getByRole('button', { name: 'Close evidence', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `evidence/contrast-overview-${width}.png`, fullPage: true, animations: 'disabled' });
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/invalid-example.csv'));
  await expect(page.locator('.alert.error')).toBeVisible(); await measure('validation-error');
  const failures = groups.flatMap(group => group.measurements.filter(m => m.ratio < m.minimum).map(m => ({ view: group.view, ...m })));
  await writeFile(`evidence/contrast-${width}.json`, JSON.stringify({ width, groups, failures }, null, 2) + '\n');
  expect(failures, JSON.stringify(failures.slice(0, 12), null, 2)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('readability: mobile assumptions, finding labels, KPI notes and footer use legible text without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 }); await page.goto('/');
  await expect(page.getByText('504 validated orders')).toBeVisible();
  for (const selector of ['.assumption-bar small', '.finding-value>span', '.kpi-foot', '.page-footer']) {
    const sizes = await page.locator(selector).evaluateAll(nodes => nodes.map(node => parseFloat(getComputedStyle(node).fontSize)));
    expect(sizes.length).toBeGreaterThan(0); expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('case cancellation: navigating away before the source preview resolves does not steal view or focus', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  const held = await holdResponse(page, '/api/research');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click(); await held.entered;
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  await held.finish(); await expect(page.getByRole('heading', { name: 'Good analysis starts with good data.', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Data & method', exact: true })).toBeFocused();
});

test('mobile menu: closed navigation is absent from keyboard focus and Escape restores the trigger', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 800 });
  await page.goto('/');
  const nav = page.locator('.sidebar');
  await expect(nav).toBeHidden();
  const toggle = page.getByRole('button', { name: 'Toggle navigation', exact: true });
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Overview', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(nav).toBeHidden(); await expect(toggle).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.querySelector('.sidebar')!.contains(document.activeElement))).toBe(false);
  await page.setViewportSize({ width: 1280, height: 800 }); await expect(nav).toBeVisible();
});

test('mobile menu: 375px drawer has a scrim and a visible close button, both return focus; small links are ≥24px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  const nav = page.locator('.sidebar');
  const toggle = page.getByRole('button', { name: 'Toggle navigation', exact: true });
  const scrim = page.getByTestId('nav-scrim');
  await expect(scrim).toHaveCount(0);
  await toggle.click(); await expect(nav).toBeVisible(); await expect(scrim).toBeVisible();
  const close = nav.getByRole('button', { name: 'Close navigation', exact: true });
  await expect(close).toBeVisible();
  const box = (await close.boundingBox())!; expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  await close.click(); await expect(nav).toBeHidden(); await expect(scrim).toHaveCount(0); await expect(toggle).toBeFocused();
  await toggle.click(); await expect(scrim).toBeVisible();
  await scrim.click({ position: { x: 340, y: 400 } }); await expect(nav).toBeHidden(); await expect(toggle).toBeFocused();
  await toggle.click(); await page.keyboard.press('Escape'); await expect(nav).toBeHidden(); await expect(toggle).toBeFocused();
  for (const target of [page.getByRole('button', { name: 'View all findings', exact: true }), page.getByRole('button', { name: 'Model a scenario', exact: true }), page.getByRole('link', { name: 'Source & version', exact: true })]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(nav.getByRole('button', { name: 'Close navigation', exact: true })).toBeHidden();
});

test('case page: Policy-to-Test starts collapsed with a one-line verdict summary and the draft sits next to the decision', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const lab = page.getByRole('region', { name: 'Policy-to-Test', exact: true });
  const summary = lab.locator('summary.ptl-oneline');
  await expect(summary).toHaveText('Same evidence, three origins: code → review · manual → fix challenged · unknown → on hold');
  await expect(lab.getByRole('article')).toHaveCount(0);
  await expect(lab.getByLabel('Choose the repair to challenge', { exact: true })).toBeHidden();
  const draft = page.getByRole('button', { name: 'Show recorded Nemotron draft', exact: true });
  await expect(draft).toBeVisible();
  await expect(page.getByRole('button', { name: 'Draft offline checks', exact: true })).toHaveCount(0);
  expect(await draft.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.policy-source')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(await draft.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.policy-test-lab')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await summary.click();
  await expect(lab.getByRole('article')).toHaveCount(3);
  // The disclosure stays open when a context change reloads the saved packet.
  await page.getByLabel('Discount origin').selectOption('unknown');
  await expect(summary).toHaveText('Same evidence, three origins: code → review · manual → on hold · unknown → on hold');
  await expect(lab.getByRole('article')).toHaveCount(3);
  // Authored (not recorded) saved packets keep the offline-checks label.
  await expect(page.getByRole('button', { name: 'Draft offline checks', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show recorded Nemotron draft', exact: true })).toHaveCount(0);
});

for (const width of [1280, 390]) test(`case focus: ${width}px explicit entry reveals and focuses the asynchronous decision`, async ({ page }) => {
  await page.setViewportSize({ width, height: 800 });
  await page.emulateMedia({ reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
  await page.goto('/');
  const start = page.getByRole('button', { name: 'See the discount policy counterexample', exact: true });
  if (width === 390) { await start.focus(); await page.keyboard.press('Enter'); } else await start.click();
  const heading = page.getByRole('region', { name: 'Evidence and next check', exact: true }).getByRole('heading', { name: 'Rule-based next check', exact: true });
  await expect(heading).toBeFocused();
  const box = await heading.boundingBox(); expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(60); expect(box!.y + box!.height).toBeLessThan(780);
  await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
  await page.screenshot({ path: `evidence/case-focus-${width}.png`, animations: 'disabled' });
});

test('visual: case comparison is readable at mobile width and keyboard works with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Policy counterexample demo', exact: true });
  await expect(hero).toContainText('Suggested fix');
  await expect(hero).toContainText('Next check after policy');
  await expect(hero).toContainText('Saved Shopify policy result');
  const contrast = await hero.evaluate(node => {
    const luminance = (color: string) => { const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
    const description = getComputedStyle(node.querySelector('.case-description')!);
    const a = luminance(description.color), b = luminance(getComputedStyle(node).backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const motion = await hero.evaluate(node => ({ animation: getComputedStyle(node).animationName, duration: getComputedStyle(node).transitionDuration }));
  expect(motion.animation).toBe('none'); expect(motion.duration).toBe('0s');
  const start = page.getByRole('button', { name: 'See the discount policy counterexample', exact: true });
  await start.focus(); await expect(start).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
  await page.screenshot({ path: 'evidence/visual-mobile-case.png', fullPage: true });
});

test('judge entry: one click shows the manual-discount action change, honest mode and working source branch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  const decision = page.getByRole('region', { name: 'Evidence and next check', exact: true });
  await expect(decision).toContainText('28 flagged rows; $658.08 modeled exposure.');
  await expect(decision).toContainText('20% discount ceiling');
  await expect(decision).toContainText('Policy says the suggested fix won’t work');
  await expect(decision.locator('.decision-change')).toContainText('Same 28 CSV rows. Same $658.08 modeled exposure.');
  await expect(decision.locator('.decision-change')).toContainText('Saved policy summary');
  await expect(decision).toContainText('Audit staff/manual POS');
  await expect(page.locator('.policy-card')).toContainText('Saved result');
  await expect(page.getByRole('link', { name: 'Source & version', exact: true })).toHaveAttribute('href', 'https://github.com/Allenllii/marginguard/blob/main/docs/RELEASE.md');
  await page.locator('.policy-card').screenshot({ path: 'evidence/judge-case-entry.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: 'See the discount policy counterexample', exact: true }).click();
  await expect(decision).toContainText('Audit staff/manual POS');
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
  await expect(page.getByLabel('Discount origin')).toHaveValue('unknown');
});

test('review: ordinary apps hold, confirmed Scripts API uses its own exception, and privacy says where CSVs are processed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await expect(page.locator('.analyst-card')).toContainText('raw rows and product names never reach a prompt');
  await expect(page.locator('.analyst-card')).not.toContainText('stay local');
  await page.getByLabel('Discount origin').selectOption('app');
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  const decision = page.getByRole('region', { name: 'Evidence and next check', exact: true });
  await expect(decision).toContainText('An app is not necessarily using the Scripts API');
  await expect(page.getByRole('button', { name: 'Draft with Nemotron', exact: true })).toHaveCount(0);
  await expect(page.getByText('Live Nemotron drafts run locally with your keys.', { exact: true })).toBeVisible();
  await page.getByLabel('Discount origin').selectOption('scripts-api');
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  await expect(decision).toContainText('Audit the originating Scripts API');
  await page.getByRole('button', { name: 'Draft offline checks', exact: true }).click();
  await expect(page.locator('.remediation')).toContainText('Scripts API exception');
  await page.getByRole('button', { name: 'Data & method', exact: true }).click();
  await expect(page.locator('.method-card')).toContainText('on its server when you run it yourself, inside your browser on the hosted demo');
  await expect(page.locator('.method-card')).toContainText('never written to a database or analytics');
  await expect(page.locator('.method-card')).toContainText('use synthetic or non-sensitive data');
  await expect(page.locator('.method-card')).not.toContainText('local server memory');
});

test('journey: policy evidence survives scenario navigation but a different dataset clears it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('CSV files are processed by this app (in your browser on the hosted demo), not stored, and never sent to Tavily or Nebius. Use synthetic or non-sensitive data.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByLabel('Discount origin').selectOption('manual');
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  await page.getByRole('button', { name: 'Show recorded Nemotron draft', exact: true }).click();
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
  await page.getByRole('button', { name: 'Export policy evidence', exact: true }).click();
  await (await download).saveAs('evidence/navigation-policy-export.md');
  expect(await readFile('evidence/navigation-policy-export.md', 'utf8')).toContain('discount origin manual');
  await page.getByLabel('Import order CSV').setInputFiles(path.resolve('data/template.csv'));
  await expect(page.locator('.dataset-strip')).toContainText('1 validated order');
  await expect(page.getByRole('status')).toContainText('Imported 1 validated order');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await expect(page.locator('.remediation')).toHaveCount(0);
});

test('clarity: the evidence decision leads the draft and keeps assumptions, citations and authority explicit', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByLabel('Discount origin').selectOption('manual');
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  const decision = page.getByRole('region', { name: 'Evidence and next check', exact: true });
  await expect(decision.getByRole('heading', { name: 'Rule-based next check', exact: true })).toBeVisible();
  await expect(decision).toContainText('28 flagged rows; $658.08 modeled exposure.');
  await expect(decision).toContainText('20% discount ceiling');
  await expect(decision.getByRole('link', { name: '[S1]' })).toHaveAttribute('href', 'https://help.shopify.com/en/manual/discounts/discount-combinations');
  await expect(decision.getByRole('link', { name: '[S2]' })).toHaveAttribute('href', 'https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts');
  expect(await decision.evaluate(node => Boolean(node.compareDocumentPosition(document.querySelector('.policy-source')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.getByRole('button', { name: 'Show recorded Nemotron draft', exact: true }).click();
  // The manual case replays the Nemotron draft recorded with this exact Tavily packet, labelled as model text.
  await expect(page.locator('.remediation').getByText('Recorded Nemotron draft', { exact: true })).toBeVisible();
  await expect(page.locator('.remediation')).toContainText('replayed offline');
  await expect(page.locator('.remediation')).not.toContainText('Rule-based rationale');
  // Code's decided check and Nemotron's own procedure sit side by side.
  const draft = page.locator('.remediation');
  await expect(draft.getByRole('heading', { name: 'Decided by code', exact: true })).toBeVisible();
  await expect(draft.getByRole('heading', { name: 'Nemotron’s procedure', exact: true })).toBeVisible();
  await expect(draft.locator('.step-compare>div').first()).toContainText('Audit staff/manual POS');
  await expect(draft.locator('.step-compare>div').last()).toContainText('filter for flagged orders');
  await expect(draft.locator('.step-compare>div').last()).not.toContainText('Audit staff/manual POS');
  // S1 and S2 share one code-owned statement: one line citing both.
  const cited = draft.locator('p', { hasText: 'manual-discount exception to combination settings' });
  await expect(cited).toHaveCount(1); await expect(cited.getByRole('link')).toHaveText(['[S1]', '[S2]']);
  await expect(page.locator('.remediation')).toContainText('A draft cannot approve a remedy or estimate recovery.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export policy evidence', exact: true }).click();
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
  await page.getByRole('button', { name: 'Show saved policy result' }).click();
  await expect(page.getByText('Saved result · no live search ran', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Draft offline checks' }).click();
  await expect(page.getByText('Offline analyst checks', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open official source' })).toHaveAttribute('href', 'https://help.shopify.com/en/manual/discounts/discount-combinations');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'evidence/desktop-policy-evidence.png', fullPage: true });
  await page.locator('.policy-card').screenshot({ path: 'evidence/policy-feature.png' });
  const policyDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export policy evidence' }).click();
  await (await policyDownload).saveAs('evidence/exported-policy-evidence.md');
  expect(await readFile('evidence/exported-policy-evidence.md', 'utf8')).toContain('Search mode: fixture');
  await expect(page.getByRole('button', { name: 'Generate NVIDIA brief' })).toHaveCount(0);
  await expect(page.getByTestId('mode-badge')).toHaveText('Demo: saved results');
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
  await page.getByRole('button', { name: 'Show saved policy result' }).click();
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
  await expect(page.getByRole('button', { name: 'Search official policies' })).toHaveCount(0);
  await expect(page.getByText('Live Tavily search runs locally with your keys.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show saved policy result' }).click();
  await page.getByLabel('Policy finding').selectOption('shipping-overrun');
  await expect(page.getByRole('link', { name: 'Open official source' }).first()).toHaveAttribute('href', /usps\.com/);
  await page.getByLabel('Shipping carrier').selectOption('UPS');
  await page.getByRole('button', { name: 'Show saved policy result' }).click();
  await expect(page.getByRole('link', { name: 'Open official source' })).toHaveAttribute('href', /www.ups.com/);
  await expect(page.getByRole('button', { name: 'Draft with Nemotron' })).toHaveCount(0);
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
    if (endpoint.endsWith('remediate')) { await page.getByRole('button', { name: 'Show saved policy result' }).click(); await expect(page.getByText('SEARCH QUERY · NO STORE DATA')).toBeVisible(); }
    const held = await holdResponse(page, endpoint);
    await page.getByRole('button', { name: endpoint.endsWith('research') ? 'Show saved policy result' : 'Draft offline checks' }).click(); await held.entered;
    await page.getByRole('button', { name: 'Reset demo' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Synthetic demo loaded' })).toBeVisible(); await held.finish();
    await expect(page.getByText('SEARCH QUERY · NO STORE DATA')).toHaveCount(0); await expect(page.getByText('Offline analyst checks', { exact: true })).toHaveCount(0);
  }
});
test('policy exception redirects a manual-discount check and missing/wrong-region context holds', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByLabel('Discount ceiling percent').fill('30'); await page.getByLabel('Shipping subsidy USD').fill('5'); await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.locator('.assumption-bar>small')).toContainText('Applied: 30%');
  await page.getByRole('button', { name: /^Findings/ }).click(); await page.getByLabel('Discount origin').selectOption('manual'); await page.getByRole('button', { name: 'Show saved policy result' }).click();
  await expect(page.locator('.decision-status')).toHaveText('Policy says the suggested fix won’t work'); await expect(page.getByTestId('decision-next-check')).toContainText('Audit staff/manual POS');
  await page.getByRole('button', { name: 'Show recorded Nemotron draft', exact: true }).click(); await expect(page.locator('.remediation')).toContainText('Audit staff/manual POS');
  await page.locator('.policy-card').screenshot({ path: 'evidence/policy-manual-exception.png' });
  await page.getByLabel('Discount origin').selectOption('unknown'); await page.getByRole('button', { name: 'Show saved policy result' }).click(); await expect(page.locator('.decision-status')).toHaveText('On hold — needs more evidence');
  await page.getByLabel('Operating region').selectOption('UK'); await page.getByRole('button', { name: 'Show saved policy result' }).click(); await expect(page.getByTestId('decision-next-check')).toContainText('Confirm the operating region');
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

test('mode badge reports /api/health and live controls appear only when configured', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
  const health = (nvidia: boolean, tavily: boolean) => ({ ok: true, provider: { mode: nvidia ? 'configured' : 'fixture', model: nvidia ? 'mock/nemotron' : null, endpoint: 'mock' }, tavily: { mode: tavily ? 'configured' : 'fixture', endpoint: 'mock' } });
  for (const [nvidia, tavily, label] of [[true, true, 'Live: Tavily + Nemotron'], [false, true, 'Live: Tavily · Nemotron off'], [true, false, 'Live: Nemotron · Tavily off'], [false, false, 'Demo: saved results']] as const) {
    await page.unroute('**/api/health');
    await page.route('**/api/health', route => route.fulfill({ json: health(nvidia, tavily) }));
    await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
    await expect(page.getByTestId('mode-badge')).toHaveText(label);
    await page.getByRole('button', { name: /^Findings/ }).click();
    const search = page.getByRole('button', { name: 'Search official policies', exact: true });
    const brief = page.getByRole('button', { name: 'Generate NVIDIA brief', exact: true });
    if (tavily) await expect(search).toBeDisabled(); else await expect(search).toHaveCount(0);
    if (nvidia) await expect(brief).toBeDisabled(); else await expect(brief).toHaveCount(0);
  }
  // Rendering live controls never sends a provider request on its own.
  expect(posts).toEqual([]);
});

test('skip link: first Tab stop moves focus to the main content without changing the route', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
  await expect(skip).toBeFocused(); await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('saved mode: changing discount origin, region or platform re-runs the saved decision in one action, with no live call', async ({ page }) => {
  const bodies: { live?: boolean }[] = [];
  page.on('request', request => { if (request.method() === 'POST') { expect(new URL(request.url()).pathname).toBe('/api/research'); bodies.push(request.postDataJSON()); } });
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click();
  const status = page.locator('.decision-status'), next = page.getByTestId('decision-next-check');
  await page.getByLabel('Discount origin').selectOption('manual');
  await expect(status).toHaveText('Policy says the suggested fix won’t work'); await expect(next).toContainText('Audit staff/manual POS');
  await page.getByLabel('Discount origin').selectOption('unknown');
  await expect(status).toHaveText('On hold — needs more evidence');
  await page.getByLabel('Discount origin').selectOption('manual'); await expect(next).toContainText('Audit staff/manual POS');
  await page.getByLabel('Operating region').selectOption('UK');
  await expect(next).toContainText('Confirm the operating region');
  await page.getByLabel('Operating region').selectOption('US'); await expect(next).toContainText('Audit staff/manual POS');
  await page.getByLabel('Store platform').selectOption('WooCommerce');
  await expect(page.locator('.policy-source a').first()).toHaveAttribute('href', /woocommerce\.com/);
  await expect(next).not.toContainText('Audit staff/manual POS');
  expect(bodies.length).toBeGreaterThanOrEqual(6);
  expect(bodies.every(body => body.live === false)).toBe(true);
});

test('live mode: a context change clears a live result and waits for an explicit search', async ({ page, baseURL }) => {
  const saved = await (await page.request.post('/api/research', { headers: { Origin: baseURL! }, data: { kind: 'discount', live: false, context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' } } })).json() as ResearchPacket;
  await page.route('**/api/health', route => route.fulfill({ json: { ok: true, provider: { mode: 'fixture', model: null, endpoint: 'mock' }, tavily: { mode: 'configured', endpoint: 'mock' } } }));
  const posts: unknown[] = [];
  await page.route('**/api/research', route => { posts.push(route.request().postDataJSON()); return route.fulfill({ json: { ...saved, mode: 'live', checkedAt: '2026-10-30T00:00:00.000Z' } }); });
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByLabel('Discount origin').selectOption('manual');
  await expect(page.getByText('SEARCH QUERY · NO STORE DATA')).toHaveCount(0);
  expect(posts).toEqual([]);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Search official policies', exact: true }).click();
  await expect(page.getByText('Live Tavily result', { exact: true })).toBeVisible();
  await page.getByLabel('Discount origin').selectOption('unknown');
  await expect(page.getByText('SEARCH QUERY · NO STORE DATA')).toHaveCount(0);
  expect(posts).toHaveLength(1);
});

test('provenance: Tavily Search → Extract steps and a changed-page notice render only when the packet carries them', async ({ page, baseURL }) => {
  const saved = await (await page.request.post('/api/research', { headers: { Origin: baseURL! }, data: { kind: 'discount', live: false, context: { platform: 'Shopify', carrier: 'USPS', region: 'US', discountOrigin: 'manual' } } })).json() as ResearchPacket;
  let extra: object = {};
  await page.route('**/api/research', route => route.fulfill({ json: { ...saved, retrieval: undefined, policyChanged: undefined, ...extra } }));
  await page.goto('/'); await expect(page.getByText('504 validated orders')).toBeVisible();
  await page.getByRole('button', { name: /^Findings/ }).click();
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  await expect(page.getByTestId('decision-next-check')).toBeVisible();
  await expect(page.locator('.retrieval-steps')).toHaveCount(0); await expect(page.locator('.policy-changed')).toHaveCount(0);
  extra = {
    retrieval: { steps: [
      { op: 'search', url: 'https://help.shopify.com/en/manual/discounts', requestId: '19444728-22d2-4be8-ab7e-7c4d0714bb07', credits: 2, latencyMs: 4970, ok: true },
      { op: 'extract', url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', requestId: '9cdee07d-026f-460b-8433-a9dc5f80ad85', credits: 1, latencyMs: 106, ok: false },
    ] },
    policyChanged: { url: 'https://help.shopify.com/en/manual/discounts/discount-combinations', reviewedAt: '2026-10-27' },
  };
  await page.getByRole('button', { name: 'Show saved policy result', exact: true }).click();
  const steps = page.locator('.retrieval-steps');
  await expect(steps).toContainText('TAVILY SEARCH → EXTRACT');
  await expect(steps.locator('li')).toHaveCount(2);
  await expect(steps.locator('li').first()).toContainText('request 19444728…');
  await expect(steps.locator('li').first()).toContainText('2 credits');
  await expect(steps.locator('li').first()).toContainText('4970 ms');
  await expect(steps.locator('li').first()).toContainText('ok');
  await expect(steps.locator('li').nth(1)).toContainText('failed');
  const notice = page.locator('.policy-changed');
  await expect(notice).toContainText('Official page changed since our review'); await expect(notice).toContainText('2026-10-27');
  await expect(notice.getByRole('link')).toHaveAttribute('href', 'https://help.shopify.com/en/manual/discounts/discount-combinations');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
