# Verification - 2026-10-27

Workspace: `C:\Users\liwen\Documents\Codex\2026-10-27\task\margin-guard`.

Local production URL: **http://127.0.0.1:3000**. This Windows loopback address is not reachable from the user's iOS device. The native Sites project is registered but has not been published; its expected origin is not proof of a working public site.

Run `npm ci --ignore-scripts --registry=https://registry.npmjs.org`, `npm run build`, then `npm start`. Verified Node 24.19.0 / npm 11.17.0 on Windows. `npm start` loads the approved local `.env.local` server configuration; tests use explicit offline QA mode and never need that file.

## Executed checks

| Check | Observed result |
| --- | --- |
| ESLint | Passed, zero warnings/errors |
| Strict TypeScript and Vite production build | Passed; JS 281.50 kB / 87.02 kB gzip, CSS 30.67 kB / 7.43 kB gzip |
| Unit/API/adapter/security/budget tests | 53 passed, zero failed/skipped |
| Offline production Chrome scenarios | 7 passed, zero failed, 7.5 seconds in the final run |
| Golden synthetic data evaluation | 3/3 issue types, exact 3/3 exposure amounts and row sets; 63 evidence rows; clean control zero findings |
| Predeclared policy routing fixtures | 12/12 passed; synthetic decision routing, not a live accuracy score |
| Portable Worker ESM | Built; 864,770 bytes, three embedded assets, no Node builtins; health/page/demo/analyze/manual-policy/remediation/origin-rejection smoke passed |
| Real Tavily CLI request | Succeeded locally: `75fc38ff-9fd0-4b4a-ae88-26ffc1aa57e5`, 1,682 ms, one returned usage credit, 2026-10-27 20:40:24 UTC |
| Real Tavily browser integration | Succeeded locally: `1952d500-3070-4422-92ea-ea1a82bbafcd`, 120 ms, one returned usage credit, 2026-10-27 20:53:41 UTC; exactly one live search and zero live model requests in that flow |
| Dependency audit | Last executed `npm audit` reported zero vulnerabilities; dependencies have not changed since that audit |

`check.log`, `browser-results.json`, `evaluation.json`, and `policy-fixture-evaluation.json` retain executed results. `tavily-live-proof.json` and `tavily-ui-live-proof.json` contain actual provider provenance and returned public policy evidence, with no credentials. `tavily-policy-review.json` records the limited human source review. Final source packaging excludes secrets, dependencies, browser traces, private transfer receipts and video/audio drafts.

## Covered behavior

The seven browser cases cover desktop calculations/evidence/scenarios/report exports/import/reset; mobile navigation and layout; canceled/oversize imports and repeated visits; a delayed explanation after a different import and repeated identical resets; delayed policy search/remediation after reset; editable assumptions with manual-discount exception and missing/wrong-region holds; and overlapping imports resolved in the correct order. Race tests deliberately ignore abort in the mocked response to test generation guards. Tested mobile views have no page-level horizontal overflow.

Unit/API cases include integer cents, refund COGS assumptions, scenario bounds, row-order invariance, distinct SKU IDs for `A.B`, `A-B`, `ABC`, and `abc`; malformed/oversize/formula/invalid CSV; host/origin/security headers; no-key behavior; constrained search plans and official-domain screening; irrelevant/malicious/error search results; NVIDIA model-ID/reference/output validation and honest fallback; streamed byte limits; and budget reservations across concurrent/new SQLite instances. Mocked provider tests are not live-call evidence.

The actual Tavily UI flow used synthetic orders and a seller-selected manual/POS origin. Retrieved official Shopify POS evidence contradicted the initial combination-settings fix and redirected the next check to a staff/manual override audit. The UI held the NVIDIA action disabled and generated explicitly offline checks, with no inference call. This demonstrates useful policy-conditioned routing; it does not prove the merchant's cause or semantic correctness of every future citation. Plan/location, transaction and policy applicability remain seller checks. Source-ID membership alone is not entailment.

## Golden synthetic totals

504 orders, September 1-28, 2026; seed 73021; fingerprint `0aca9bee505e7050`.

- Gross sales: **$44,560.00**.
- Net revenue: **$39,846.22**.
- Contribution: **$22,077.83**; margin **55.407589%** (55.4% displayed).
- Refunded orders: **21**.
- Modeled exposure: returns **$1,040.00** (14 recent evidence rows), discounts **$658.08** (28), shipping **$220.50** (21); total **$1,918.58**.

Default seller assumptions are a 20% discount ceiling and $3 shipping subsidy. They are editable and are not Shopify policy. At 30% / $5, regression tests expect discount exposure $292.48 and shipping exposure $178.50. Calculations do not establish realized recovery, accounting profit or causation.

## Supporting screenshots

Existing actual-UI captures include `desktop-overview.png`, `desktop-evidence.png`, `desktop-scenario.png`, `desktop-policy-evidence.png`, `policy-manual-exception.png`, `desktop-brief.png`, `mobile-overview.png`, `mobile-evidence.png`, and `mobile-policy-evidence.png`. Screenshots use synthetic data and visible fixture labels. No new video or presentation polishing is being performed; existing draft files remain unchanged and unpublished.

## Remaining release gates

1. **NVIDIA on Nebius:** no key or successful runtime call. Authenticated `/models`, actual structured-output compatibility, request ID, tokens, latency and cost remain unmeasured. No NVIDIA/Tavily live comparison has run.
2. **Public Sites deployment:** project `appgprj_6ae108e911088191834d591d732db251` exists; no pushed commit/saved version/deployment success yet. The required source-workflow helper is unavailable in this Windows runtime. The parent must use its Sites-capable environment with the same canonical source and exact project ID. Hosted secrets are not authorized; D1 binding/migration and provider hard caps must be verified before hosted live calls.
3. **Public GitHub source:** approved target `Allenli1233/marginguard` returned 404. Local browser/CLI belongs to a different account, `Allenllii`; no repository was created there, and its credentials were not changed. Correct-account access or repository creation is pending parent coordination.
4. **Public smoke and independent review:** unauthenticated deployed flows, real hosted provenance and the parent's fresh weighted review remain pending. The prior narrow audit corrections are fixed; this is not completion of the requested whole-project review.
5. **Video/submission:** stopped by the user's sequencing instruction until functionality/integrations, deployment, review and fixes are complete. No public upload or Devpost submission. Preserve October 30, 2026, 17:00 UTC freeze and free judge access through December 15.

No failed operation above is awaiting a native approval prompt in this implementation task. The outstanding publishing paths are capability/correct-account blockers, and Nebius is an account-access blocker handled by the parent. The project is not claimed competition-ready or final-eligibility complete.
