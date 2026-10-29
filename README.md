# MarginGuard

**Find the leaks. Follow the evidence. Model your next move.**

MarginGuard is a local, hackathon-sized margin analyst for small ecommerce sellers. It validates order CSVs, calculates contribution and three transparent leakage rules, shows source rows and formulas, models recovery assumptions, and exports a report. For discount and shipping findings, a scoped Tavily workflow retrieves official policy evidence for the selected platform/carrier. An optional NVIDIA model on Nebius Token Factory drafts a cited remediation check, separating documented policy, analyst inference, and user-provided costs.

**Current status:** local MVP targeting the verified Best Use of Tavily award, with Apps and Agents as an optional track target. Offline fixture guidance and source fixtures are clearly labeled. Five recorded local Tavily searches returned one usage credit each; the historical and current operator proofs are retained. Public source is available in stacked draft PRs. A real NVIDIA/Nebius policy-integration case passed after a documented truncated first attempt. Public deployment, final independent review, final benchmark, final video and submission remain pending. A labeled 150-second local fixture review recording is available. Passing local checks does not establish final eligibility.

## Run locally

Requires Node.js **24.19+** (tested on Node 24.19.0) and npm. Windows PowerShell is supported.

```powershell
cd margin-guard
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run dev
```

Open **http://127.0.0.1:3000**. This is a loopback address on this computer, not a hosted judge URL. The demo loads automatically, without an account or API key. CSVs are not written to disk by the server.

For the production build:

```powershell
npm run build
npm start
```

Build outputs are separate: `frontend-dist/` serves the Node production app and supplies embedded Worker assets; `dist/` contains only the Sites Worker artifact. `npm run build` then `npm start` remains the local production workflow. The npm build uses a cross-platform Node equivalent of the official Worker starter's copy step.

If port 3000 is occupied, set `$env:PORT='3001'` for this process. `npm run dev` runs one Express server with Vite middleware; production serves the generated frontend through that same server. No separate frontend port is required.

## Demo route

1. Overview: 504 synthetic orders for September 1–28, 2026.
2. Inspect the top finding to see thresholds, exact cents, and original CSV row numbers.
3. Findings: choose a discount or shipping finding, a supported platform/carrier context, preview **offline** source fixtures, inspect a reference source, and draft **offline** checks. No current retrieval or model call is claimed.
4. Scenario lab: adjust each recovery assumption; no changes are executed.
5. Export the report and evidence rows.
6. Import `data/template.csv`, then try `data/invalid-example.csv`; reset the demo afterward.

The fixed-seed fixture contains these planted issues:

| Finding | Evidence rows | Modeled exposure |
| --- | ---: | ---: |
| Recent CLOUD-HOODIE return-rate spike | 14 | $1,040.00 |
| Stacked promotions above a 20% ceiling | 28 | $658.08 |
| Shipping above customer fee plus $3 subsidy | 21 | $220.50 |
| Total | 63 | $1,918.58 |

Net revenue is $39,846.22; contribution is $22,077.83. These are synthetic, deterministic results. Exposure is a policy-dependent scenario, not realized savings or a real-world accuracy measurement.

## CSV contract

One order per row, UTF-8 CSV, USD only, maximum 2 MB / 10,000 rows. Required unique headers (order may vary):

```text
order_id,order_date,sku,category,gross_sales,discount,promo_count,cogs,shipping_charged,shipping_cost,refund,return_cost
```

- IDs: unique, 1–64 letters, digits, `_` or `-`.
- SKU/category: 1–64 letters, digits, spaces, dots, `_` or `-`. No spreadsheet formulas or markup.
- Dates: valid `YYYY-MM-DD` calendar dates.
- Money: nonnegative decimal USD, at most two decimal places, no separators or currency symbols. Gross must be positive. Discount ≤ gross; refund ≤ gross − discount.
- `promo_count`: integer 0–10. Return handling requires a positive refund.
- Unknown, duplicate, missing columns, malformed quoting, impossible dates, and duplicate order IDs are rejected with actionable errors.

Partial refunds count as returns in this MVP. Distinct orders and a single currency are assumptions; line-item exports must be aggregated before import. Do not upload customer identity, card details, or secrets.

## Calculation and scenario assumptions

All monetary input becomes integer cents before computation.

```text
net revenue = gross − discount − refund + shipping charged
contribution = net revenue − COGS − shipping cost − return cost
contribution margin = contribution / net revenue (zero when revenue is zero)
```

COGS stays expensed on refunded orders. Restocking credits, taxes, marketplace/payment fees, marketing, fixed overhead, and shipping refunds are not modeled. Contribution is not accounting profit.

- **Discounts:** kept orders only, at least two promos, discount above `round(gross × 20%)`. Exposure is only the excess above that assumed ceiling.
- **Shipping:** kept orders only, exposure `max(0, shipping cost − shipping charged − $3)`.
- **Returns:** per SKU, latest seven days ending at the dataset's latest date versus preceding twenty-one days. Minimum five recent and ten baseline orders, recent return rate ≥15%, ≥10 percentage points higher, and at least twice baseline. Exposure is `(recent returns − recent orders × baseline rate) × mean recent (refund + return cost)`, rounded to cents. It does not establish causation or significance. With sparse baseline data, no return finding is emitted.
- **Simulation:** sum each finding's cents exposure × chosen recovery percentage, rounded per finding. Discount and shipping are distinct financial components; refunded orders are excluded from both, avoiding overlap with modeled refund loss. No demand elasticity, timing, execution cost, or causal model. Compare contribution at current revenue; no operational changes execute.

The SHA-256 prefix identifies the exact imported CSV bytes; the complete raw data remains in the current browser/session and local server memory only. Reload resets to synthetic data.

## NVIDIA on Nebius: optional live mode

Default configurable model: `nvidia/Nemotron-3_5-Lightning`. Its public catalog listing was verified on October 27, 2026; runtime availability is checked with authenticated `GET /models` before each requested completion. No alternate vendor/model is silently substituted.

Official sources:

- [Nebius quickstart and OpenAI-compatible endpoint](https://docs.tokenfactory.nebius.com/quickstart)
- [GET /models](https://docs.tokenfactory.nebius.com/api-reference/models/list-models)
- [JSON output](https://docs.tokenfactory.nebius.com/ai-models-inference/json)
- [NVIDIA model catalog listing](https://tokenfactory.nebius.com/models/catalog/text2text/nvidia%2FNemotron-3_5-Lightning)

After access/credits and a live test are authorized, provide `NEBIUS_API_KEY` in the **server process environment** through an approved secret mechanism, set `NEBIUS_ENABLE_LIVE=true`, and optionally set `NEBIUS_MODEL`. Never paste a key into frontend code, a chat, a CSV, a repository, or screenshots. `.env.example` is documentation only. Local start and explicitly invoked live-verification scripts load ignored `.env` and `.env.local` files if present; builds and offline tests do not load it. Preserve existing entries and use only approved credential configuration. No persistent credential configuration is required.

The server calls `https://api.tokenfactory.nebius.com/v1/models`, then `chat/completions` with `response_format: {type: 'json_object'}`. The schema is checked with Zod and exact evidence membership; refusals, truncation, unsupported prose claims, duplicate/unknown IDs, invalid JSON, timeouts, and upstream errors produce a visible **offline fallback**, without claiming live success. One synthetic policy-integration case has now produced a validated real response; exact observations and remaining limits are recorded in `docs/INTEGRATION.md`. This does not establish semantic fidelity across cases.

Only generated finding IDs, rule kinds, aggregate counts, exposures, and calculated metric values are sent. No raw CSV, imported product labels, order IDs, or filenames enter the prompt. The model produces plain text only, cannot change money calculations, cannot execute actions, and cannot introduce numeric prose claims. React escapes returned text.

Live requests require both a server enable flag and an explicit consent checkbox/click. The local server enforces one in-flight live request and a ten-second cooldown. A successful real response displays requested time, model, returned request ID, observed elapsed time (catalogue + completion), and token counts if provided. Until that happens, **no live evidence or eligibility completion is claimed**. Mock HTTP adapter tests use fixture keys/responses and do not establish a real provider call.

## Tavily policy evidence: two scoped workflows

The feature is in **Findings**, below the deterministic watchlist. Discount checks support Shopify or WooCommerce official documentation. Shipping checks support USPS or UPS official documentation. This MVP supports US context only. Return-spike analysis stays local; it is not a third search workflow.

`POST https://api.tavily.com/search` uses a server-only Bearer token, `search_depth: basic`, `max_results: 3`, official `include_domains` with restrict mode, no generated answer, no raw-content request, usage reporting, and no automatic parameter expansion. Only a generic rule category plus fixed selected context appears in the query. No CSV, SKU, order ID, costs, or product name is sent to search. [Official Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search).

After account/credit authorization, set approved transient `TAVILY_API_KEY` and `TAVILY_ENABLE_LIVE=true` on the server. An explicit user click and consent are still required. `401`, `429` with Retry-After, quota `432`, payment-cap `433`, timeout, invalid output, irrelevant results, and empty results are visible states. No automatic paid retry occurs. Live errors show no invented citations.

Results are screened for HTTPS, exact official domains/subdomains, topic relevance, low scores, duplicate URLs, suspicious directives, and bounded lengths. Short returned excerpts are selected around relevant operative terms, capped at seventy words and 1,200 characters per source and treated as untrusted evidence. This screening is not a guarantee against every prompt injection. The model receives excerpts as labeled data, cannot execute tools, and must cite existing generated source IDs. Unknown citations or unsupported numeric/guaranteed-savings claims trigger a visible offline fallback.

The provider adapter also enforces context holds before any request. Only passages supporting the deterministic policy decision enter remediation prompts or its citation allowlist; an unrelated returned result cannot be cited merely because it has a source ID. Offline checks likewise select a supporting passage. These boundaries do not prove semantic entailment.

Source cards show actual returned URLs, short excerpts, retrieval time, and returned publication date when available. **Publication/retrieval dates are not policy effective dates.** Applicability to a store, contract, service, or fee remains unverified. Offline fixtures use authored summaries and known reference links, no retrieval time, and explicit fixture labels. The exported policy report separates source-linked policy, analyst inference, CSV costs, and provider provenance.

For an authorized operator test only:

```powershell
npm run verify:tavily       # actual Tavily search only, requires its enabled approved credentials
npm run verify:policy-live  # actual Tavily → actual NVIDIA/Nebius cited workflow, requires both
```

These commands fail before attempting requests if required credentials/enable flags are missing. They write genuine proof only after validated real responses; the normal offline test suite never creates live-proof files. Policy evidence is held in a bounded in-memory cache for ten minutes, and remediation uses the server-issued ID, so client-supplied source text is not trusted. Export the policy evidence before navigating away.

## Local migration verification

`db/schema.ts` and `drizzle.config.ts` define three operational tables for request budgets and short public-policy cache entries. The canonical schema-only migration, snapshot and journal are tracked under `drizzle/`. `npm run db:generate` validates the current schema against that history; append new migrations for later schema changes. No orders, credentials or seed data belong in migrations.

The migration tests perform fresh isolated generation, compare its SQL to the canonical migration, verify repeated generation changes no history, and exercise SQLite keys, nonnegative budget counts, null constraints, expiry indexing and concurrent budget reservations. Hosted migration application is a separate deployment gate.

The development dependency override for `@esbuild-kit/core-utils` pins its nested `esbuild` to 0.25.12, addressing the advisory for the older development-server dependency without downgrading Drizzle Kit. Actual migration generation and the full test suite must continue to pass when changing this override. The direct application esbuild version is unchanged.

## Verify

```powershell
npm run lint
npm run build
npm test
npm run data:generate
npm run evaluate
# Start npm run start:qa in another terminal, then:
npm run test:ui
npm audit --registry=https://registry.npmjs.org
```

Browser tests use the installed Google Chrome through Playwright (`channel: chrome`), or configure an available Playwright Chromium installation. The API tests require local loopback access; a restricted sandbox may require execution approval. No external service is used by the tests.

`data/ground-truth.json` pins exact expected exposures and all 63 evidence row IDs. `evaluate` checks the seeded fixture plus a clean control and writes `evidence/evaluation.json`. This is a tiny synthetic rule evaluation, not a production/model benchmark. Browser runs save screenshots, exported reports, and `evidence/browser-results.json`. See `evidence/readiness-20261029.md` for the latest local checks; `evidence/local-merge-verification.md` records the completed deployment/Drizzle merge; `evidence/verification.md` retains earlier verification history. Live adapter tests are mocked and explicitly do not prove an actual sponsor API call.

## Architecture and boundaries

```text
Browser CSV → local Express validation → integer-cent rule engine → dashboard/evidence/scenarios
                                           ↓ explicit requested live brief
                                safe aggregate evidence → NVIDIA on Nebius
                                           ↓
                               schema + reference validation → escaped plain text
```

`server/analysis.ts`: parsing/calculations; `server/demo.ts`: seeded synthetic generator; `shared/policy-decision.ts`: conservative applicability decisions; `server/tavily.ts` and `server/nebius.ts`: provider adapters; `server/service.ts`: shared use cases; `server/app.ts` and `worker/entry.ts`: transport boundaries; `src/`: React UI; `tests/`: deterministic, API, connector, and browser checks. Official framework references: [Vite](https://vite.dev/guide/), [Express](https://expressjs.com/en/starter/installing/), [CSV Parse](https://csv.js.org/parse/api/sync/).

There are no customer accounts, billing, telemetry, or secrets in the client. Local use has no database; a hosted D1 contract stores only request budgets and short public-policy packets. Public live calls fail closed until durable storage, provider hard caps and approved runtime secrets are configured. See `docs/DEPLOYMENT.md` for the actual publishing blockers and `docs/submission-draft.md` for remaining submission steps. Do not expose the development server to the internet.

## License

MIT; see [LICENSE](LICENSE). Dependencies retain their respective licenses. NVIDIA model/API terms apply separately. The approved public repository is `https://github.com/Allenllii/marginguard`; final source publication is a separate release step.

## Evidence-conditioned discount plan and honest evaluation

Discount origin is seller-provided context: automatic/code, manual/POS/draft, app/Scripts API, or unknown. It is not inferred from the CSV. Shopify's documented manual and Scripts API exception can contradict an initial generic combination-settings fix and redirect the next check to staff overrides or app/script logic. Unknown or wrong-region context holds the recommendation. A decision card separates CSV fact, editable seller assumption, policy constraint, next check and disconfirming evidence. Source-ID checks do not prove semantic fidelity.

The discount ceiling is now genuinely editable (0–60 integer percent), as is the shipping allowance ($0–$20, cents precision). The defaults are seller demo assumptions, never platform requirements. Recalculation invalidates previous explanations and exports the exact applied values. Distinct case/punctuation SKUs retain distinct SHA-256 issue IDs. Async dataset generations protect against delayed responses, repeated resets and overlapping imports.

`npm run evaluate:policy` checks twelve predeclared synthetic routing cases: four applicable, four missing-context/exception, two conflicting/insufficient, and two malicious/irrelevant. `npm run evaluate:live` is a separately gated observational harness for deterministic-only, NVIDIA without retrieval, and NVIDIA with Tavily. It requires both approved credentials plus `EVAL_APPROVED_MAX_HTTP_REQUESTS` (1–60); it records actual responses/failures and a human-review checklist without inventing accuracy or improvement scores. Actual live evaluation remains pending. This development harness counts each GET /models, completion and search HTTP attempt separately; logical operations are recorded independently. Its transport reserves before requests, never retries, permits only the fixed sponsor endpoints, and records unknown network outcomes without arbitrary error strings or credentials. A model operation needs room for both catalogue and completion. The legacy operation-count budget variable is no longer accepted. This exploratory harness is not the final benchmark; the controlled final protocol is in `docs/SPEC.md` and remains NOT RUN until its release gates.

Existing local fixture video/narration drafts are unchanged and unpublished. Video and presentation work is paused by the user's instruction until actual integrations, deployment, independent review and fixes are complete.

See `docs/ARCHITECTURE.md` for module contracts and review boundaries, `docs/DEPLOYMENT.md` for the portable Worker and remaining hosted gates, and `docs/RELEASE.md` for exact artifact identities and the October 30, 17:00 UTC freeze.

Observed Tavily proof: `evidence/tavily-live-proof.json` records request `75fc38ff-9fd0-4b4a-ae88-26ffc1aa57e5`, retrieval 2026-10-27 20:40:24 UTC, 1,682 ms and one returned usage credit. `tavily-policy-review.json` records the limited review of the relevant official POS exception and remaining eligibility/causality constraints. This does not satisfy the separate NVIDIA-on-Nebius requirement.

`npm run verify:tavily-ui` tests the actual local browser/backend integration and makes one approved public-policy search. Its executed evidence is `evidence/tavily-ui-live-proof.json`: request `1952d500-3070-4422-92ea-ea1a82bbafcd`, 120 ms, one returned usage credit, one live search and zero live model requests. The manual-discount decision changed to an override audit; NVIDIA remained disabled. This script is an integration check, not a presentation recording.

## Observed sponsor integration

`npm run verify:integration -- --live --max-http-requests=3` is an explicit operator integration check. It requires both approved provider keys/enable flags and an explicit NVIDIA model; it is never run by the offline suite. It persists a reservation before each of its fixed search/catalogue/completion requests, preserves old runs, never retries automatically and records bounded diagnostics without raw credentials or errors. See [INTEGRATION.md](docs/INTEGRATION.md) and `evidence/live-integration-proof.json`. The released Lightning profile disables hidden thinking without increasing the output-token cap and requests `store:false`; unknown model IDs receive no guessed template flags.

The final benchmark remains NOT RUN. The two failed development probes and the one accepted response are all disclosed; the extra prose-only hard-limit candidate was not released. Current local credentials are not part of this repository or source archive.
