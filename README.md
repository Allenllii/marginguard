# MarginGuard

**Find the leaks. Follow the evidence. Model your next move.**

[Open the public judge demo](https://marginguard-evidence.liwenzhao0306.chatgpt.site) | [Source: main](https://github.com/Allenllii/marginguard/tree/main) | [Development specification](docs/SPEC.md) | [Release identities](docs/RELEASE.md)

MarginGuard helps small ecommerce sellers turn a margin anomaly into a specific next check. It validates an order CSV, calculates exact contribution and rule-based exposure, shows the source rows, and uses policy evidence to qualify a proposed remedy. The primary demonstration redirects an overly generic discount-settings suggestion to a manual-override audit when the applicable Shopify exception supports that change.

## What the judge demo does

The public site is an **offline demonstration** with synthetic orders, authored policy summaries and deterministic guidance. It makes **no Tavily or model requests**. Live buttons are disabled, and the forced-offline Worker ignores runtime provider keys and database bindings. The current deployed version and any pending source update are recorded in [RELEASE.md](docs/RELEASE.md). The main branch contains the integrated source. Source and Site versions are separate; a source revision is not claimed deployed until the Site is verified.

1. From the homepage, click **See the discount policy counterexample**. It opens the synthetic discount case with manual-origin context and offline source preview in one click: 28 rows, $658.08 modeled exposure at the default seller ceiling.
2. Choose **Manual / POS / draft**, then **Preview source fixtures**. The rule-based decision redirects the next check to staff/manual overrides. Expand the source and inspect its limitations.
3. Choose an unknown origin, ordinary app mechanism, or wrong region to see the recommendation held. A confirmed Scripts API origin is distinct from an ordinary app.
4. Draft offline checks, change recovery assumptions in **Scenario lab**, return to the evidence, then export the report. Importing another dataset or changing rule assumptions clears old results.

The selected origin is seller-provided context, not a connected Shopify account or an inference from the CSV. The source describes an investigation constraint; it does not establish the anomaly's cause or guarantee recovery.

## Real integrations: observed locally, separate from the hosted demo

The server has actual Tavily and NVIDIA-on-Nebius adapters. A controlled local browser probe on October 29 used Tavily search, authenticated model discovery and one successful completion from `nvidia/Nemotron-3_5-Lightning`.

| Observation | Recorded result |
| --- | --- |
| Tavily request | `8df2a245-7576-48d3-9d40-ffb7b7213991`; 1 returned credit; 1,851 ms |
| NVIDIA completion | `196038cb42e7180cb4fb6c1b30977819`; 579 input / 99 output tokens |
| Model stage | 2,164 ms including model discovery and validation |
| Scope | One controlled probe; three HTTP requests; no automatic retry |

See [sanitized proof](evidence/pr7-live-journey-20261029.json) and [observed feedback](docs/PR7-LIVE-VERIFICATION.md). These are observations on the recorded source revision, not a model-quality benchmark or proof that the hosted site runs live inference. Earlier failed attempts remain documented. The latest routing/privacy/fixture corrections have their own offline regressions.

Tavily receives only fixed generic platform/carrier policy queries restricted to official domains. NVIDIA receives aggregate finding metrics and short supporting passages. Code owns money calculations and policy decision status; model drafts pass schema, reference and bounded-claim checks or display an explicit fallback. Source membership alone does not prove semantic fidelity.

## Run and reproduce

Requires Node.js 24.19+ and npm. Windows PowerShell is supported.

```sh
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run dev
```

Open http://127.0.0.1:3000. No account or key is needed for fixture mode. For local production, run `npm run build` then `npm start`. Vite output stays in `frontend-dist/`; Worker packaging uses `dist/` and does not remove the Node frontend.

```sh
npm run check
npm run build:offline-demo
```

`check` runs lint, strict TypeScript, frontend/Worker builds, unit/API tests and small synthetic rule/routing evaluations. The offline build also checks embedded HTML/JS/CSS, disabled providers and a cross-instance fixture draft. For browser tests, run `npm run start:qa` in one terminal and `npm run test:ui` in another. Chrome must be installed; `MARGINGUARD_TEST_URL` can select another tested app origin. Browser tests use synthetic data.

This integrated candidate passed **264 unit/API tests, 65 offline evaluation-harness self-tests, 12 synthetic routing cases and 13 offline artifact route checks**. The same **57 browser scenarios** passed on local Node and forced-offline Worker boundaries. Raw regression logs remain local. These are development regressions; the predeclared final benchmark has **not run**.

## Optional campaign preparation

Open **Promo Preflight**, then **Review a campaign with policy evidence**. The
synthetic preview sends no request and requires rule review before simulation.
Local live mode separately requires an availability check, supported seller
context, one-use credit consent, then a second explicit rule confirmation. The
model interprets a narrow normalized grammar; it cannot invent money or change
the store. The JSON audit records preparation provenance separately from the
integer calculation.

The new bridge's one controlled actual probe made two successful Tavily HTTP
requests, then **HOLD** after extraction. No NVIDIA request or proposal resulted.
The browser success path is currently verified with mocks, not a successful
actual bridge run. Existing live analyst evidence above belongs to its separate
recorded workflow. See [bridge review and actual observations](docs/SPONSOR-BRIDGE-REVIEW.md).

## Synthetic data and calculation contract

Seed 73021 creates 504 orders for September 1-28, 2026. Generate it with `npm run data:generate`; verify it with `npm run evaluate`. [Ground truth](data/ground-truth.json) pins amounts and all evidence row IDs.

| Golden result | Value |
| --- | ---: |
| Net revenue | $39,846.22 |
| Contribution | $22,077.83 |
| Recent return spike | $1,040.00 / 14 evidence rows |
| Stacked discounts | $658.08 / 28 evidence rows |
| Shipping overrun | $220.50 / 21 evidence rows |
| Total modeled exposure | $1,918.58 / 63 rows |

All money is integer cents: net revenue = gross - discount - refund + shipping charged; contribution subtracts COGS, shipping cost and return cost. COGS remains expensed on returns. Taxes, payment fees, marketing, fixed overhead and restock credits are outside this MVP. Exposure is a hypothetical review candidate, not realized savings, accounting profit or demonstrated customer impact.

The discount ceiling (default 20%, editable 0-60%) and shipping allowance (default $3, editable $0-$20) are seller assumptions, not platform rules. Returns compare the latest seven days with the preceding twenty-one under explicit volume/rate thresholds. Refund orders are excluded from the discount/shipping rules. Scenario recovery percentages do not model demand or execution costs.

CSV: UTF-8, USD, one unique order per row, maximum 2 MiB and 10,000 rows. Use [template.csv](data/template.csv). Required columns:

```text
order_id,order_date,sku,category,gross_sales,discount,promo_count,cogs,shipping_charged,shipping_cost,refund,return_cost
```

The parser rejects missing/unknown/duplicate headers, duplicate IDs, impossible dates, malformed quoting, unsafe labels and invalid or inconsistent amounts. Partial refunds count as returns. Aggregate line-item exports before import.

## Privacy, runtime controls and architecture

CSV uploads are sent to the app server for validation and calculation. They remain in browser/session and transient server memory; this app does not persist CSVs in a database or analytics. Use synthetic or non-sensitive data on the public site. Hosting infrastructure may process request metadata. Raw rows, order IDs, product labels and filenames are excluded from provider prompts and search queries.

Local live mode needs approved server-side credentials and explicit flags/consent. Never commit `.env` or `.env.local`. Builds and offline tests do not load local secret files. Operator verification commands are documented in [DEPLOYMENT.md](docs/DEPLOYMENT.md). Public live mode remains off; durable request budgets and verified provider monetary caps are required before considering it. No secret is needed for the public offline demo.

The [architecture map](docs/ARCHITECTURE.md) separates deterministic math, policy applicability, provider transport, request budgets/stores, UI orchestration and Node/Worker boundaries. Explicit fixture references rebuild only canonical server-authored summaries across cold Worker instances; live research uses server-issued UUIDs and expiring server storage. Imported or client-supplied source text cannot become live evidence.

## Release status

Public offline hosting and genuine local sponsor calls exist. Independent review and corrections are in progress. Final controlled benchmark, release freeze, final video and Devpost submission remain pending. No award odds, generalized accuracy or customer savings are claimed. [Submission draft](docs/submission-draft.md) and [release checklist](docs/RELEASE.md) distinguish completed evidence from remaining gates.

Submitted artifacts freeze at **October 30, 2026, 17:00 UTC**. Preserve free judge access through December 15. No automatic post-freeze updates to submitted source, site or video.

MIT; see [LICENSE](LICENSE). Dependency and model/API terms apply separately.

The current visual revision leads with a policy hypothesis/change comparison, a separate evidence boundary and a single case entry. It uses system fonts and CSS only, with keyboard activation, measured hero-text contrast, 320px layout checks and prefers-reduced-motion support. See [visual design rationale](docs/VISUAL-DESIGN.md).

## Controlled final benchmark preparation

The evaluation-only framework is described in [docs/FINAL-BENCHMARK.md](docs/FINAL-BENCHMARK.md). `npm run benchmark:test` runs offline harness regressions with injected transports. `npm run benchmark:plan -- --config scripts/benchmark/example.config.json --dataset scripts/benchmark/fixture.dataset.json` prints a disabled development plan without provider calls or credential loading. The exploratory `evaluate:live` script is not a fair final benchmark and must not be used to claim retrieval superiority. Final independent holdout/gold, pricing/budget review, exact frozen candidate, concrete plan approval and human blinding remain pending. No final benchmark has run.

## CSV column mapping

On **Data & method**, the mapping assistant previews different export headers in browser memory. Every analysis field is required and every omitted column needs explicit review. It never infers totals, currencies, dates or missing costs. Only the selected columns are sent to the app server after **Analyze mapped CSV**; local preview, validation and download send no CSV requests. The built-in example remains labeled synthetic through recalculation. See [CSV mapping contract and limitations](docs/CSV-MAPPING.md).

The default `npm run test:ui` includes the mapping regressions. A focused run uses `npx playwright test --config playwright.csv-mapping.config.ts` against the documented local offline server.

## Evidence-conditioned policy tests

Policy-to-Test challenges a proposed investigation against native, manual and unknown synthetic origins using one existing policy packet. Exact passages and a narrow rule/title catalog determine supported, contradicted or HOLD; unknown context, retractions, expired guidance and incompatible regions hold. This new view makes no provider call and has not received a new live-model evaluation. See [contract and limitations](docs/POLICY-TO-TEST.md).

**Download Policy-to-Test audit (JSON)** preserves the proposed action, three
scenario judgments, HOLD reasons, exact received source text and dataset
assumptions in a local snapshot. It makes no new request and excludes raw CSV,
order records and product labels. Fingerprints detect differences and do not
authenticate evidence. See [export contract](docs/POLICY-TEST-AUDIT.md).

## Promo Preflight

The isolated sandbox exhaustively evaluates bounded seller-authored promotion rules in integer cents, exposes the worst modeled contribution and exports replayable inputs. It is not a Shopify checkout emulator, store execution or a savings forecast. Hypothetical source attestations stay explicit; missing evidence holds. Workspace navigation preserves imported analysis and releases hidden dialog effects. See [model and limits](docs/PROMO-PREFLIGHT.md) and [audit corrections](docs/AUDIT-FOLLOWUP.md). The existing public Site is a separately versioned offline demonstration; source publication does not claim its deployment was updated.


## Reviewed bridge and same-cart follow-up

The local sponsor bridge now has a verified synthetic browser path through real
Tavily Search/Extract and NVIDIA on Nebius, followed by explicit operator review
and an integer-only simulation. The earlier HOLD observations remain preserved;
HTTP success is never relabeled as a usable proposal. This is a local development
observation, not a claim that the hosted offline demo makes live calls, that a
human was authenticated, or that a real checkout is verified.

The preflight reference catalog is deliberately narrow: the exact reviewed
Shopify extraction must match its SHA-256 fingerprint. Changed or unreviewed
source bytes HOLD pending review; eligibility conditions remain unverified.
See [diagnosis and boundaries](docs/BRIDGE-DIAGNOSTICS.md).

**Compare the same cart** locks one basket and its costs before comparing the
original and an explicitly reviewed alternative. It reports conditional
contribution difference, never realized savings. Source edits invalidate the
lock. See [comparison contract](docs/SAME-CART-COMPARISON.md).
