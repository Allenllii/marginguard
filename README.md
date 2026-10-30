# MarginGuard

**Check the fix before you ship it.** MarginGuard finds where a small online store is losing margin, then tests the suggested fix against live official policy before the seller acts on it.

[Live demo](https://allenllii.github.io/marginguard/) · [Demo video](__VIDEO_URL__) · [Spec](docs/SPEC.md) · [Architecture](docs/ARCHITECTURE.md)

Built for the Nebius x NVIDIA Global AI Hackathon: **Best Apps and Agents** track, **Best Use of Tavily** prize.

## The problem

A seller sees discounts eating margin. The usual advice, from dashboards and chatbots alike, is "tighten your discount combination settings." On Shopify that advice is a no-op for a whole class of discounts: custom discounts applied manually in POS or on draft orders apply regardless of combination settings. The seller flips the toggle, nothing changes, and the leak continues.

Generic AI advice fails here because it never checks the platform's own rules against the seller's situation.

## What MarginGuard does

1. **Finds the leak with exact math.** Import an order CSV. Deterministic code computes contribution in integer cents and flags discount stacking, shipping overruns and return spikes. Every finding shows its formula, its source rows and the seller assumptions behind it.
2. **Challenges the proposed fix with live policy.** For the flagged issue, MarginGuard sends **Tavily Search** a neutral query (it names the topic, not the answer we expect) restricted to the platform's own domain, then **Tavily Extract** pulls the official page so the rule engine reads full sentences instead of a cut-off snippet. <!-- verify-after-merge --> The rule engine decides whether that text applies to the seller's context. If the official page has changed since we reviewed it, the result says so. <!-- verify-after-merge -->
3. **Changes the next action, not the numbers.** In the demo case Tavily returns Shopify's POS policy: *"Custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions."* The settings fix is rebutted, and the next check becomes an audit of staff/manual overrides. Same 28 rows, same $658.08 modeled exposure, different action.
4. **Holds when context is missing.** An unknown discount origin, a non-US region or an ordinary app mistaken for the Scripts API holds the recommendation whatever the sources say. A retracted or contrary passage also holds; no passage, or passages that conflict, return "not enough evidence".
5. **Drafts the check with NVIDIA Nemotron on Nebius Token Factory.** Code supplies the policy statement behind each citation; Nemotron-3.5-Lightning writes the hypothesis, the validation step and the uncertainty. Code checks every citation against the returned sources and rejects numbers in the prose. A held or under-evidenced case never reaches the model.
6. **Tests a promotion before launch.** In Promo Preflight, describe a campaign in plain English. Nemotron 3 Super turns it into structured rules; code checks every value against the campaign text and against a local parser where one applies. Tavily pulls the governing policy page, the seller confirms, and an integer simulator finds the worst cart. The built-in sample walkthrough shows how stacking can turn a $50 cart into **−$6.00 contribution**.

## How the sponsor technology is used

<!-- verify-after-merge: diagram shows Search -> Extract in the policy check -->
```mermaid
flowchart LR
  CSV[Order CSV] --> A[Deterministic engine<br/>integer cents, findings]
  A --> Q[Context: platform, region,<br/>discount origin]
  Q --> T[Tavily Search<br/>neutral query, official domain only]
  T --> E[Tavily Extract<br/>full official page]
  E --> S[Screening: domain, injection,<br/>retraction, region, duplicates]
  S --> D[decidePolicy<br/>single decision authority]
  D --> N[Nemotron on Token Factory<br/>cited draft]
  N --> V[Citation + claim validation]
  V --> UI[Next check, hold, or rebuttal]
  P[Campaign text] --> R[Nemotron reasoning model<br/>text to rules] --> G[Rule validation + seller confirm] --> X[Integer simulation]
  TE[Tavily Extract<br/>policy page] --> G
```

| Technology | Where | What it does |
| --- | --- | --- |
| **Tavily Search** | `server/tavily.ts` | Fixed, neutral queries (never order data), `include_domains` restricted to help.shopify.com, woocommerce.com, usps.com or ups.com; results are screened and de-duplicated. The retrieved text decides the verdict.<!-- verify-after-merge --> |
| **Tavily Extract** | `server/tavily.ts`, `server/preflight-policy.ts` | Pulls the full official page after Search so the decision reads complete sentences and can detect a changed page<!-- verify-after-merge -->; in Promo Preflight, pulls the reviewed policy page before any rule is proposed. |
| **Nebius Token Factory** | `server/nebius.ts`, `server/preflight-intent.ts` | OpenAI-compatible API; model IDs verified with `GET /v1/models` before each call. |
| **NVIDIA Nemotron-3.5-Lightning** | cited policy draft, analyst brief | Fast structured drafts: the recorded policy draft took 1.0 s and 579 input / 100 output tokens. The last live brief failed the no-digits check and fell back; its prompt now sends no numbers, and that change has not been re-run live. |
| **NVIDIA Nemotron 3 Super** | Promo Preflight | Reasoning model that turns free-form campaign text into rules; code checks each value against the text and a local parser before the seller confirms. |

The model never computes money or decides eligibility. Those stay in `server/analysis.ts`, `shared/policy-decision.ts` and `shared/preflight.ts`.

## A real live run

Recorded from the local app on 2026-10-30 with synthetic data ([ledger](evidence/live-run-20261030.json)):

| Call | Result |
| --- | --- |
| Tavily Search, help.shopify.com | request `19444728-22d2-4be8-ab7e-7c4d0714bb07`, 1 credit, 1.5 s; returned the Shopify POS combination policy |
| Decision | settings fix rebutted → audit manual/POS/draft overrides |
| Nemotron-3.5-Lightning completion | request `31354285bac744de81d06e20979fcac4`, 579 input / 100 output tokens, 1.0 s |

## Try it

**Hosted demo (no account, no keys).** [Open the demo](https://allenllii.github.io/marginguard/), click **See the discount policy counterexample**, then switch the discount origin between *Manual / POS / draft* and *Unknown*: the next check changes as soon as you pick. The hosted build runs offline and makes no provider calls. It replays recorded Tavily Search + Extract responses for the manual, automatic/code and USPS cases<!-- verify-after-merge --> and the recorded Nemotron draft, and labels each as recorded.

**Run locally (offline).**

```sh
npm ci --ignore-scripts
npm run dev        # http://127.0.0.1:3000
```

**Run locally with live Tavily + Nemotron.** Create `.env.local`:

```sh
TAVILY_API_KEY=...
TAVILY_ENABLE_LIVE=true
NEBIUS_API_KEY=...
NEBIUS_ENABLE_LIVE=true
NEBIUS_MODEL=nvidia/Nemotron-3_5-Lightning
NEBIUS_REASONING_MODEL=nvidia/nemotron-3-super-120b-a12b
```

Then `npm run dev`, open the counterexample, tick the consent box and click **Search official policies**, then **Draft with NVIDIA**. Each provider is capped at 2 calls/minute, 20/day and 100 per process by default.

Requires Node.js 24.19+.

## Safety and privacy by design

- Raw rows, order IDs, product names and file names never enter a search query or prompt; only aggregate metrics and short cited passages reach the model.
- CSVs are processed in memory (in your browser on the hosted demo) and not stored.
- Tavily results are restricted to official domains and screened for prompt-injection text, retractions, regional scope and duplicates.
- Model output is schema-validated; citations must reference returned sources; digits in model prose are rejected so money stays in code.
- Provider calls need explicit consent, are rate- and budget-capped, never retried silently, and every failure is shown.

## Synthetic data and golden numbers

Seed 73021 generates 504 orders (September 1-28, 2026) with three planted issues. `npm run evaluate` checks them against [ground truth](data/ground-truth.json).

| | Value |
| --- | ---: |
| Net revenue | $39,846.22 |
| Contribution | $22,077.83 |
| Return spike (CLOUD-HOODIE) | $1,040.00 / 14 rows |
| Stacked discounts | $658.08 / 28 rows |
| Shipping overrun | $220.50 / 21 rows |

Modeled exposure is a review candidate, not realized savings. Discount ceiling (default 20%) and shipping allowance (default $3) are editable seller assumptions, not platform rules. CSV format: [template](data/template.csv); UTF-8, USD, up to 2 MiB / 10,000 rows.

## Benchmark: what retrieval did and did not do

We preregistered a small with- vs without-retrieval benchmark ([preregistration](docs/benchmark/PREREGISTRATION.md), [results](docs/benchmark/RESULTS.md)): 24 synthetic holdout cases written by an independent AI agent, the same Nemotron-3.5-Lightning prompt, schema and parameters in both arms, two replicates, scoring blind to arm.

**Result: the frozen Tavily package did not improve the model's decisions.** Nemotron answered "insufficient" in 93 of 96 outputs with or without sources; on the 8 applicable-policy cases the with-sources arm scored 0.875 vs 1.000 (p = 1.0, too few families to detect a difference). The main limit was retrieval coverage in the harness's fixed basic query: only 4 of 24 packages contained the page the gold relies on. All roles were AI agents; no human reviewed the gold. Cost: 24 Tavily credits and about 97k Nebius tokens (estimated USD 0.20; invoices not checked).

What this means for the product: MarginGuard does not rely on the model to decide applicability. Code decides from the retrieved text; with no usable passage the answer is "not enough evidence", and missing context is a hold. The neutral-query Search → Extract design responds to the coverage problem above; it has not been re-benchmarked. <!-- verify-after-merge -->

## Tests

`npm run check` runs lint, strict TypeScript, the frontend and Worker builds, 317 unit/API tests, 65 benchmark-harness tests and the synthetic routing evaluation.<!-- verify-after-merge: counts --> Browser tests (`npm run start:qa`, then `npm run test:ui`) run 77 Playwright scenarios covering keyboard use, 320-375px layouts, reduced motion, failure states and privacy.<!-- verify-after-merge: counts -->

## Limits

All data is synthetic and there is no store connection: the seller supplies the discount origin. The policy rules cover a deliberately small set of Shopify, WooCommerce, USPS and UPS cases. Live mode runs locally with your own keys; the hosted demo replays a recorded run.

## Project layout

```
server/   analysis, provider adapters (tavily, nebius, preflight-*), orchestration, Express adapter
shared/   pure logic shared by server, Worker and UI: policy decision, preflight simulation, types
src/      React UI (no money or eligibility logic)
worker/   Worker entry points (live and forced-offline)
tests/    unit/API tests and Playwright specs
data/     synthetic dataset, template, ground truth
docs/     spec, architecture, feature notes; docs/history holds earlier process notes
```

MIT licensed; see [LICENSE](LICENSE).
