# MarginGuard development specification

## 0. Submission spec v2 (2026-10-30, supersedes earlier sections where they conflict)

**Deadline:** 2026-10-30 10:00 PT (17:00 UTC), per the [official rules](https://nebiusglobalaihackathon.devpost.com/rules). Entry: Best Apps and Agents track + Best Use of Tavily bonus prize (one track award and one bonus award are allowed per project).

**User.** Owner or ops lead of a small US Shopify/WooCommerce store who exports order CSVs and has no analyst.

**Problem.** Margin tools and AI assistants hand out generic fixes ("tighten discount combination settings"). Platform policy often makes the fix a no-op: Shopify manual POS and draft-order discounts apply regardless of combination settings. Acting on the wrong fix wastes the seller's time while the leak continues.

**Differentiation.** Retrieval is used as a test the proposed fix must pass, not as decoration. Live official policy (Tavily) can contradict a fix and redirect the next check; missing context holds the recommendation. Money and eligibility stay in deterministic code; the model drafts and interprets, and code validates.

**Sponsor technology, substantive roles.**
- Tavily Search: domain-restricted official policy retrieval (advanced depth with relevant chunks), screened for domain, injection text, retractions, region, duplicates. The retrieved passage decides the verdict via `decidePolicy`.
- Tavily Extract: full reviewed policy page in Promo Preflight before rules are proposed.
- Nebius Token Factory + NVIDIA Nemotron: `Nemotron-3_5-Lightning` (fast) drafts the cited investigation check; a reasoning model (`nemotron-3-super-120b-a12b` by default) interprets free-form campaign text into structured promotion rules. Model IDs are verified with `GET /v1/models` before use.

**Primary flow.** Load synthetic store or CSV → findings with formula and rows → choose finding + seller context → live policy (or recorded replay) → verdict and next check, same rows and dollars → Nemotron cited draft → Promo Preflight: describe a campaign, Nemotron proposes rules, seller confirms, integer simulation shows worst cart → export audit.

**Functional requirements / acceptance.**
| ID | Requirement | Acceptance |
| --- | --- | --- |
| A1 | Exact integer-cent findings with rows and formula | Golden values in `data/ground-truth.json` reproduce (`npm run evaluate`) |
| A2 | One decision authority | Main decision card and Policy-to-Test agree on the same sources (regression test with the recorded live packet) |
| A3 | Live policy changes action | Recorded live Shopify POS passage → manual scenario "fix challenged", unknown origin → hold |
| A4 | Honest mode display | Header badge reflects `/api/health`; hosted demo labels recorded responses with request IDs |
| A5 | Nemotron does real work | Free-form campaign text → validated rules; disagreement with grammar → hold; model never emits money results |
| A6 | Failure handling | Provider errors, rate limits, timeouts and budget denials are visible; no silent retry or fallback relabelled as live |
| A7 | Accessibility | Keyboard, visible focus, 320-375px without horizontal scroll, reduced motion |

**Non-functional.** Per-provider caps (2/min, 20/day, 100 lifetime by default; durable store required for any hosted live mode); bounded request/response sizes and timeouts; same-origin JSON APIs; CSV ≤ 2 MiB / 10,000 rows.

**Data and privacy.** Raw rows, order IDs, product names and file names never enter search queries or prompts. CSVs are processed in memory and not stored. All demo data is synthetic (seed 73021). Keys live only in server environment variables; never in client code, repo, logs or video.

**Modules and interfaces.** `server/analysis.ts` (CSV → findings, pure) · `shared/policy-decision.ts` (sources + context → verdict, pure, single authority) · `shared/policy-to-test.ts` (scenarios over `decidePolicy`) · `server/tavily.ts` (search plan, transport, screening) · `server/nebius.ts` (fast drafts) · `server/preflight-intent.ts` (campaign text → rules via reasoning model, validated) · `shared/preflight.ts` (integer simulation) · `server/service.ts` (HTTP-agnostic orchestration, budgets) · `server/app.ts` / `worker/*` (adapters) · `src/*` (UI only; no money or eligibility logic).

**Hosting.** Public demo is an offline build (no keys, no provider calls) that replays a recorded live run; live mode runs locally with the user's keys. A hosted live mode needs a durable budget store and provider caps and is out of scope for this deadline.

**Risks.** Single real policy exception carries the story; seller must supply discount origin; synthetic data only, no merchant validation; recorded replay ages as policies change; fair benchmark with human blind review is not feasible before the deadline (any run is labelled with its limits).

**Test and release plan.** `npm run check` (lint, types, builds, unit/API, framework tests, synthetic evaluations) + Playwright on Node and offline Worker builds; one bounded live run recorded with request IDs and usage; independent review against the four official criteria, fixes, re-review; freeze source commit, demo build and video together; submit by 09:00 PT with the user performing YouTube upload and final Devpost submit.

---

*Sections 1-12 below are the original v1 specification (2026-10-29), kept for history.*

Version: 1.0, 2026-10-29. Status: implementation contract and release plan, not a claim of completed integration or an award prediction.

## 1. Outcome and audience

MarginGuard helps an owner or operations lead at a small US ecommerce store decide what to inspect after a margin anomaly. The primary audience uses Shopify and exports order-level CSVs; WooCommerce and US shipping invoice checks are secondary supported contexts. The seller may lack a dedicated analyst but can inspect promotion records and invoices.

The product promise is: show the exact CSV facts, separate the seller's assumptions, retrieve a relevant policy condition, and produce a specific, falsifiable next check. The product does not establish root cause or execute changes to a merchant account.

The primary competitive demonstration is a discount exception: an initial suggestion to inspect discount-combination settings is redirected to a manual/POS/draft-order override audit when applicable policy evidence supports that exception. Unknown origin must hold the recommendation. Tavily must change the action or its applicability, not merely decorate a generic answer with links.

Non-goals for this release: customer accounts, subscriptions, payment collection, automatic store/carrier integration, executing refunds or promotion changes, demand forecasting, a broad web agent, investment advice, a third returns-policy search workflow, and additional dashboards without a demonstrated decision benefit.

## 2. Competition constraints and honest claims

The target is Best Use of Tavily, with Apps and Agents as an optional track. The official rules require functional runtime sponsor usage; the project must also satisfy the required NVIDIA/Nebius technology use. Technical implementation, product design, potential impact and idea quality are equally weighted. There is no separate published Tavily scoring formula. A test pass count is not a winning probability.

The release must provide English project/testing material, open-source code, a usable judge-access path, and genuine runtime evidence. Preserve free judge access through December 15. Freeze submitted artifacts at October 30, 2026, 17:00 UTC; record the exact source commit, deployment version, dataset hashes and video version. Recheck the rules before final submission. No automatic post-freeze updates to submitted artifacts.

Source: [official rules](https://nebiusglobalaihackathon.devpost.com/rules), sections 4-6 and 8, checked 2026-10-29. Do not submit final entry or accept new terms without the applicable user/platform approval.

As of this specification, the local baseline has 61 unit/API/build/migration tests, ten browser scenarios and twelve synthetic routing cases passing. Two historical local Tavily calls have real proof. Actual NVIDIA inference, the complete public source/demo and final independent review are incomplete. These are release gates, not optional presentation details.

## 3. Core journey and visible decisions

1. Load the reproducible synthetic demo or import a valid CSV. Mark synthetic data explicitly.
2. Show revenue, contribution and rule-based exposure. Each finding opens exact source rows, assumptions and cent arithmetic.
3. Let the seller edit a discount ceiling and shipping allowance within bounded ranges. Recompute all findings, clear old explanations and export the exact applied values.
4. Select finding, platform/carrier, region and discount origin. This context is user supplied, not inferred from a Shopify connection.
5. Show the generic search query and external-data consent. No search happens on upload or initial load.
6. Retrieve official sources with Tavily, preview the operative passage and its limitations, then compute the applicability decision.
7. Show the recovery-plan chain: CSV fact -> seller assumption -> policy constraint -> next check -> evidence that would disprove the hypothesis.
8. Only eligible, supported live evidence can be sent to NVIDIA on Nebius for a cited draft. The model cannot set money values or the authoritative decision status.
9. Explore what-if recovery percentages; label the result hypothetical, with no guarantee of savings.
10. Export a report containing dataset/assumption/context/source/provider provenance. Reset or import invalidates every old result, including delayed responses.

### Decision semantics

| Status | Meaning | Required behavior |
| --- | --- | --- |
| Supported for review | A relevant passage supports investigating the proposed check, subject to applicability | Cite the supporting passage and state what must be verified |
| Initial settings fix contradicted | The selected origin has a supported exception to the initial settings hypothesis | Redirect to the originating manual override or app/script audit; do not assert the CSV cause is proven |
| Hold | Origin/region/applicability is missing, mismatched or not established | Ask for the missing context; no live synthesis request |
| Insufficient evidence | Safe operative evidence is absent, irrelevant, negative or conflicting | Abstain from a policy-backed recommendation; show the next evidence-gathering step |

A citation ID is structural evidence membership, not semantic entailment. No model assertion can upgrade a hold or insufficient state to validated.

## 4. Functional requirements and acceptance IDs

| ID | Requirement | Acceptance evidence |
| --- | --- | --- |
| F01 | CSV validation: UTF-8, one order/row, USD, 2 MiB and 10,000-row limits, strict unique headers and IDs, real dates, bounded safe labels and nonnegative cent amounts | Malformed, duplicate, oversize, invalid-money/date, formula/markup and valid reordered/BOM/quoted files have deterministic expected outcomes |
| F02 | Exact deterministic arithmetic and independent finding IDs | Golden fixture values/row sets match; case/punctuation-distinct SKUs do not collide; row ordering does not change aggregate results |
| F03 | Explicit editable seller assumptions | Discount ceiling 0-60 integer percent, shipping allowance 0-2000 integer cents; defaults 20%/$3 labeled demo assumptions; display/method/report use the applied values |
| F04 | Primary discount-policy exception workflow | Native/manual/app-script/unknown context is explicit; manual/app exception changes the next check; unknown or wrong region holds |
| F05 | Scoped Tavily retrieval | At most three official HTTPS sources, basic search, no generated answer, fixed generic query plan, source preview and retrieval/publication/effective-date distinction |
| F06 | Supporting-evidence boundary | Only decision-supporting passages enter a live remediation prompt/citation allowlist; an unrelated returned result cannot be cited; offline guidance selects supporting evidence too |
| F07 | NVIDIA/Nebius structured draft | Exact NVIDIA model is authenticated in GET /models; real completion passes schema/reference/claim checks; failures/refusal/truncation show truthful fallback with no live success claim |
| F08 | Cost/abuse safety | Attempt reservations before upstream work, no automatic retry, one in-flight operation/provider, cooldown, bounded bytes/tokens, durable hosted counters and verified provider hard caps |
| F09 | Honest independent provider states | Retrieval and model states separately show fixture/configured/running/live/error/held where applicable; one live provider does not imply the other ran |
| F10 | Interrupted/repeated operation safety | Reset/import/context changes cannot commit stale results; canceled/rejected/latest-file cases preserve correct data; repeat clicks cannot duplicate billable work |
| F11 | Evidence export and scenario integrity | Source rows, exact cents/formulas, assumptions/context, source URLs/passages/timestamps, provider IDs/usage and code/data identities are exportable; no guaranteed recovery claims |
| F12 | Reproducible production and judge path | Node and Worker derive from the same source; frontend-dist survives packaging; D1 schema/migration/journal are tracked; public routes/assets/API work with correct MIME and no credentials in client/build |

### Golden reference

Seed 73021, 504 synthetic orders, dataset fingerprint 0aca9bee505e7050. Revenue $39,846.22; contribution $22,077.83. Modeled exposures: returns $1,040.00 with 14 evidence rows, discounts $658.08 with 28, shipping $220.50 with 21; total $1,918.58. A clean control produces no findings. These are synthetic arithmetic checks, not real-world detection accuracy or realized impact.

## 5. Data and privacy contract

Required CSV columns: order_id, order_date, sku, category, gross_sales, discount, promo_count, cogs, shipping_charged, shipping_cost, refund, return_cost. Preserve the existing parser's documented bounds. Partial refunds count as returns; retained COGS, absent taxes/fees/restock credits and other omissions remain visible.

- CSV contents remain transient in the browser/session and server request memory. No order/customer data in D1, telemetry, analytics or provider logs.
- Tavily receives only a generic category plus selected platform/carrier/region/origin context. No CSV, order ID, SKU, product label, filename, cost or account credential enters the query.
- NVIDIA receives generated evidence IDs, aggregate metrics and approved short supporting passages after explicit consent. Raw imported labels/identifiers are excluded.
- D1 holds only bounded public-policy packets and request counters. Policy packets expire after ten minutes; raw source text is untrusted data.
- Secrets are server runtime values only, never client form fields, bundles, manifests, screenshots, reports or repository files. Never modify existing ignored secret files during publication preparation.
- Account/payment troubleshooting notes are private operational material and are excluded from the repository and source archives.

## 6. Architecture: cohesive responsibilities, explicit contracts

Retain one canonical TypeScript implementation. Extract only when a responsibility or contract demands it; avoid a rewrite or a general agent framework.

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Deterministic domain: server/analysis.ts, shared/assumptions.ts | Validation, cent arithmetic, findings, scenario assumptions, stable IDs | HTTP, provider credentials, UI decisions, generated monetary prose |
| Policy domain: shared/policy-decision.ts | Applicability, status, supporting source IDs, next check/disconfirmation | Provider transport, mutable UI state, LLM-authoritative verdicts |
| Providers: server/tavily.ts, server/nebius.ts, server/http.ts | Fixed endpoints/plans, bounded transport, untrusted-output parsing, truthful provenance | Merchant mutations, arbitrary web destinations, source money changes |
| Application service: server/service.ts | Use-case orchestration, input schemas, cache/budget contracts, guarded provider invocation | Rendering, duplicated money formulas, platform-specific sockets |
| Budgets/store: server/budget.ts and Worker D1 adapter | Durable reservation and bounded public evidence retention | Raw CSV persistence, payment/account provisioning |
| Transports: server/app.ts, server/index.ts, worker/entry.ts | Same-origin/host/body/security headers and runtime bindings | Duplicated business rules |
| UI: App and PolicyResearch components | User choices, request-generation/abort guards, evidence presentation and export | Independent financial calculations or eligibility authority |
| Build/migrations | Shared frontend path, Worker artifact contract, immutable Drizzle history | Runtime credentials or customer seeds |
| Evaluation-only runner | Frozen comparisons, explicit request budget, redacted results | Product HTTP endpoints, automatic final benchmark execution |

Core contracts remain Analysis, Assumptions, ResearchContext, ResearchPacket, PolicyDecision, Explanation, Remediation, LiveBudget and ResearchStore. Validate third-party data and user/config boundaries. Prefer additive fields over breaking current clients.

Current HTTP endpoints remain /api/demo, /api/analyze, /api/research, /api/remediate, /api/explain, /api/health and /api/template. Any error-contract improvement must preserve existing clients while adding stable machine-readable codes. Never describe a state-changing provider operation as safely retryable unless the implementation honors that contract.

Every explanation must be associated with the dataset generation, applied assumptions and selected context. A UI result from an old generation is discarded even if abort is ignored by the transport.

## 7. Provider and failure contracts

### Tavily

Use POST https://api.tavily.com/search with a server-side Bearer credential, basic/general search, max_results=3, restricted official domains, include_answer=false, include_raw_content=false, include_usage=true and auto_parameters=false. Keep the two existing workflows. Reject unsafe URLs, duplicates, low relevance and obvious directives; retain operative conditions/negation when selecting short passages. Screening does not guarantee complete prompt-injection protection.

Handle authentication, throttling/Retry-After, quota, payment-cap, timeout, invalid, irrelevant and empty responses distinctly. Do not invent fallback citations after a failed live call. A returned publication/retrieval timestamp is not a policy effective date.

### NVIDIA on Nebius

The OpenAI-compatible base is https://api.tokenfactory.nebius.com/v1/. The configurable default is nvidia/Nemotron-3_5-Lightning, subject to actual GET /models availability. Do not silently substitute DeepSeek or a non-NVIDIA model. Validate real structured-output support before declaring integration complete.

Validate the JSON schema, complete evidence references and supporting-source scope; reject unknown IDs, forbidden monetary/guaranteed-cause prose, markup, refusal and truncation. Model and source text cannot execute tools. Record actual request ID, model, requested time, latency and returned token usage, including null/unavailable values honestly. A timeout can have unknown upstream completion; do not automatically retry it or claim zero usage.

### Budgets and tracing

Default logical provider-operation limits are minute 2, UTC day 20 and total 100; public live mode requires a durable counter and verified provider account caps. Retain bounded overrides and expiry. Separately count real HTTP requests: a NVIDIA operation may include catalogue and completion requests. Never label a logical operation count as the full HTTP request count. Logs include only provider/route class, outcome, actual identifiers/usage/latency and approved limits, never authorization headers, secrets, raw CSV or payment details.

References: [Tavily API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [Nebius quickstart](https://docs.tokenfactory.nebius.com/quickstart), [models](https://docs.tokenfactory.nebius.com/api-reference/models/list-models), [JSON output](https://docs.tokenfactory.nebius.com/ai-models-inference/json).

## 8. Deliverable phases and one draft PR per step

No phase is complete merely because code exists locally. Report its source commit, acceptance checks and draft PR URL, or the exact platform/permission blocker. A draft PR is reviewable work, not a merged/released product. Do not auto-merge. Continue independent local work if a publish operation is blocked; never bypass that block.

| Phase | Cohesive deliverable | Acceptance and draft PR scope |
| --- | --- | --- |
| P0 | This specification and predeclared final-evaluation protocol | Documented goals/contracts/cases/gates; docs-only branch codex/marginguard-spec-v1 |
| P1 | Publish the existing audited source baseline | Allowlisted source, synthetic data, license, lockfile, schema/history, current regression evidence; no secrets/caches/media/account notes; baseline-source draft PR |
| P2 | Complete the discount evidence-conditioned decision | One native/manual counterexample, hold/negative/conflict behavior and supporting-only citations visible in UI/export; focused decision/UX PR |
| P3 | Complete provider-state, interruption and failure experience | Independent provider statuses, actionable errors, repeated/cancel/back/timeout behavior, correct export provenance; focused state/error PR |
| P4 | Reproducible request accounting and evaluation preparation | Count/bound actual HTTP calls, preserve logical-operation and usage counters separately, no secret logs; fixtures and harness preparation only, no final benchmark run |
| P5 | Real sponsor integrations and deployment | Authorized model catalogue/completion plus Tavily workflow proof; exact code/deployment IDs; migrated D1, unauthenticated public smoke and free judge path; no fake live labels |
| P6 | Fresh independent whole-project review and prioritized fixes | Reviewer not implementation author, equal 25-point rubric dimensions, defect evidence/severity; each cohesive correction gets a draft PR and affected regression/re-review |
| P7 | Freeze the final candidate and run the final benchmark | Only after P1-P6 functionality/integrations/review fixes are complete; predeclared protocol below, immutable artifacts and honest outcomes |
| P8 | Final English submission package and under-three-minute video | Only after project/review/final-version gates; actual recorded UI, clearly separated fixture/live proof; user reviews final public video/entry before submission |

Use narrow branches and draft PRs against Allenllii/marginguard. For dependent steps, stack PRs with an explicit base branch/commit until reviewed; do not hide dependencies or force main. The final submitted repository must expose one coherent tested commit, not a collection of incompatible draft branches.

Each PR body leads with the problem and resulting behavior, lists its acceptance IDs and actual checks, and states remaining gates. Exclude credentials, real orders, account/card diagnostics, browser profiles, caches, node_modules, videos and private transfer receipts. Runtime platform approvals remain required when surfaced. Creating a PAT, changing another account's CLI credentials, or broadening security permissions requires separate approval; an existing authenticated browser session is preferred when supported.

## 9. Final benchmark protocol: design now, run only at final version

Status: NOT RUN. Current fixture/unit tests and the existing exploratory live script are development evidence, not this final benchmark. In particular, an explanatory baseline and a remediation prompt cannot support a controlled superiority claim merely by comparing their outputs.

### 9.1 Freeze and preregistration

After functional implementation, real integration, deployment smoke and independent review/fixes, record one final-candidate code/model/prompt/config commit. Freeze dataset, expected outcomes, prompt, decoding settings and metrics before the first final run. Record changes as amendments; do not choose favorable runs, edit labels after outputs or discard provider failures silently.

Keep the existing twelve routing cases as development cases. Prepare 24 separate held-out synthetic cases before the final run: eight applicable native-discount/shipping checks, six manual/app exception counterexamples, six missing/unknown/wrong-region cases, and four negative/conflicting/irrelevant/instruction-bearing evidence cases. Expected next check, prohibited claim and abstention are annotated before model output. Record hashes and authorship. Synthetic/adversarial passages must never be represented as actual malicious content returned by Tavily.

### 9.2 Arms and fair comparison

A: deterministic CSV rules and generic checks, no model/retrieval.
B: the same NVIDIA model and a structured evidence-aware draft with no retrieved sources; any general policy knowledge is explicitly unverified and no citations are invented.
C: the same model, facts, context, output schema, system instructions, decoding and token limit, with only the screened Tavily evidence packet added.

Use an evaluation-only client for the controlled B/C ablation; it must not weaken production no-evidence/context guards or be reachable from public endpoints. Both arms use the same output contract (documentedPolicy may be empty without sources). Report end-to-end product behavior separately from this controlled prompt ablation, because routing and refusal are part of the product.

For controlled comparisons, freeze real Tavily source packets with URLs, short operative passages and retrieval times, and explicitly labeled synthetic adversarial packets. Report policy/domain reuse and case dependence. Separately run a small fresh end-to-end integration set to observe actual retrieval relevance and total latency; do not call replayed evidence a fresh search.

### 9.3 Grading

Deterministic graders: exact cents/row IDs; context/status and safe abstention; request limits; schema and reference validity; forbidden numeric/guaranteed-root-cause claims; no raw private data in requests/logs; complete success/failure/provenance accounting.

Independent blinded review: whether each policy statement follows from the operative cited passage, region/origin/plan applicability, usefulness/specificity of the next check, and appropriate uncertainty. A citation-membership pass alone is not grounding. Use two reviewers when available, report disagreements and adjudication; if only one reviewer is available, say so.

Primary outcomes: unsupported-policy-claim count, wrong-action count on exception/missing-context cases, and usable correct-next-check coverage among applicable cases. Also report abstention/over-abstention, structural failures and reviewer-rated specificity. Compare B/C per case with raw paired counts and uncertainty intervals; small synthetic samples do not establish real-world superiority or monetary impact.

Operational outcomes: actual successful/failed/unknown requests; HTTP count separately from logical operations; observed model/Tavily usage and tokens; p50 and raw latency distributions, with p95 only when sample size supports it. Report model-stage and full fresh-pipeline latency separately. Cost uses returned usage and a verified tariff; otherwise report usage only, not an invented currency estimate.

### 9.4 Budget and execution gates

No final benchmark calls until the operator authorizes an explicit request/token/credit cap and approves the actual configured credentials. Precompute the worst-case catalogue+completion HTTP count. A 24-case B/C comparison can require up to 48 model operations (and catalogue requests), plus approved retrieval; the existing development max-call setting must not be mistaken for a sufficient or correctly counted final budget.

The runner must reserve/check before each real HTTP attempt, have no automatic retries, stop at the approved limit and preserve partial outcomes. Do not silently change public limits or enable pay-as-you-go. If the approved budget is insufficient, report the preregistered run as not run/incomplete or obtain an amended budget before results; do not shrink the sample after seeing outcomes.

### 9.5 Release decision

Any unexplained money/evidence mismatch, secret disclosure, fabricated live success, wrong-region confident action or unsupported guaranteed-recovery claim blocks release regardless of aggregate score. If the final candidate fails, fix via PR, create a new candidate and document a complete rerun; preserve the earlier failure. No benchmark or award score is a winning guarantee.

## 10. Evidence and release checklist

- Exact source commit/tree, dependency lockfile, schema/migration/journal and reproducible build commands.
- Seed/data/context/assumption hashes; screenshots of the app with synthetic data only.
- Actual Tavily and NVIDIA proofs with model/request IDs, timestamps, measured latency/usage, and failures; fixtures never count as live integration.
- Public test URL, deployment version/commit, HTML/JS/CSS/API checks, migration state and unauthenticated judge journey.
- Independent review with technical/design/impact/originality evidence and prioritized defect dispositions.
- Final benchmark preregistration, frozen inputs/outputs, actual outcomes, reviewer limitations and no-run status until its gate.
- English description, testing instructions, NVIDIA/Nebius/Tavily usage explanation and feedback; final video/entry reviewed after implementation/review/benchmark gates.
- Submission ledger and freeze at 2026-10-30 17:00 UTC. Preserve judge access through 2026-12-15; no automatic post-freeze source/video/deployment changes.

## 11. Risks and explicit limits

| Risk | Response |
| --- | --- |
| Provider/account access unavailable | Continue mocks/local work; no key/card/payment/terms action without required approval; real runtime gate remains open |
| Search result is relevant-looking but inapplicable | Whole-context hold, source-scope restriction, visible eligibility/effective-date uncertainty and independent semantic review |
| Model invents a cause or cites a weak passage | Validate structure/supported IDs; human fidelity benchmark; no monetary authority or automatic action |
| Public anonymous calls exhaust funds | Durable bounded attempts, verified provider caps, no automatic retries, consent and visible quota errors; free judge-path verification |
| Synthetic results mistaken for business impact | Label seed/ground truth; report hypothetical exposure, not realized recovery or merchant accuracy |
| Source publication/tool permission blocked | Report exact attempted action/status and continue local deliverables; never bypass a denied operation |
| Build/source drift across Node and Worker | Shared domain/contracts/frontend path, exact source and artifact hashes, production and Worker smoke |
| Late feature expansion | Keep the discount exception hero and shipping fallback; prioritize broken acceptance gates over new integrations or dashboards |
| Benchmark leakage or selective reporting | Held-out labels, frozen protocol/commit, same B/C prompt contract, complete failures and reviewer limitations |

## 12. Definition of ready

Ready for final independent review means the complete primary journey works, actual sponsor integrations are proven, the public test build and source are coherent, and there are no unresolved high-severity acceptance defects. Ready for final benchmark means that review/fix cycle is complete and a final candidate plus protocol is frozen. Ready for video/submission means those final gates are complete and every claim can be traced to observed evidence. These stages must not be collapsed into 'project complete' based only on a local test count.

## Review correction - October 29

F04 is clarified: ordinary app origin is distinct from confirmed Scripts API. Ordinary apps and the legacy ambiguous app-script value hold until their application mechanism is known; only an explicit Scripts API origin and a matching passage can use that exception. M4 remains a development fixture and now names the Scripts API explicitly. This does not run or relabel the final held-out benchmark. Explicit offline fixture references are stateless and rebuild canonical authored sources; live packets remain server-issued UUIDs with expiring server storage. CSV uploads reach the app server for transient calculation, including on the hosted demo.
