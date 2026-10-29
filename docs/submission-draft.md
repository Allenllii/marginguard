# Submission draft — not submitted

Positioning follows the parent's verified award research: **Best Use of Tavily ($3,000, one winner)**, optionally **Apps and Agents Track (Jetson Orin Nano)**. The official rules require actual runtime Tavily usage and actual NVIDIA-on-Nebius usage. No separate Tavily-specific published scoring rubric was found; technical implementation, coherent product design, real-world impact, and originality remain equally weighted. No award outcome is guaranteed. [Official rules](https://nebiusglobalaihackathon.devpost.com/rules).

**Name:** MarginGuard · Evidence-conditioned Recovery Plans  
**Track:** Apps and Agents  
**Tagline:** Find the leaks. Follow the evidence. Model your next move.

## English description

Small ecommerce sellers often have order exports but little time to reconcile discount policies, refunds, and fulfillment costs. MarginGuard turns one validated CSV into a short, auditable margin watchlist.

The application calculates contribution using integer cents, applies three transparent rules, and attaches original CSV row numbers and formulas to each finding. Sellers can inspect an evidence drawer, change recovery assumptions in a scenario lab, and export a report with data provenance. A fixed-seed synthetic store with three planted issues makes the experience reproducible without customer data.

An optional NVIDIA open-source model served through Nebius Token Factory turns validated aggregate findings into an action brief and proposes an investigation order. The model cannot alter monetary values or execute store changes. Imported free text is excluded from its prompt; JSON structure and exact evidence references are checked before display. Failed or invalid inference is visibly labeled as offline guidance.

For stacked-discount or shipping-cost findings, a seller chooses platform/carrier context. Tavily retrieves relevant official documentation with source previews and retrieval timestamps. NVIDIA on Nebius can then draft a cited remediation check that separates documented policy, analyst inference, and the seller's own cost evidence. A discount-combination policy directs a configuration/eligibility review; carrier documentation directs a measurement/service/rate review. Neither proves the root cause or a particular surcharge's applicability.

The current build is a local MVP. A genuine local Tavily search is recorded; real NVIDIA inference and final hosting still must be verified before the submission claims end-to-end eligibility. The synthetic exposure total is not an actual business recovery, and our small rule evaluation does not establish real-world accuracy.

## NVIDIA / Nebius usage

- Server-side OpenAI-compatible HTTP API at `https://api.tokenfactory.nebius.com/v1/`.
- Default configured model: `nvidia/Nemotron-3_5-Lightning`, public catalog verified October 27, 2026. Exact availability checked with authenticated `GET /models` before runtime completion. No automatic substitution to DeepSeek or another provider.
- `chat/completions`, JSON response mode, Zod schema checks, exact finding-ID membership, plain escaped text, timeouts, and explicit fallback provenance.
- Intended live proof: model ID, actual UTC requested time, returned request ID if available, token usage if available, observed elapsed time, and validated returned brief. **Not yet recorded.**
- No Nebius application hosting is claimed or required by this architecture.

## Product and evaluation

- One clear loop: import → overview → evidence → brief → what-if → export.
- Exact synthetic issue/amount/row checks with a pinned golden manifest and a clean control.
- Unit/API tests cover invalid CSVs, cent math, cross-origin rejection, model-output failure modes, and imported-text isolation.
- Browser tests cover dashboard, evidence export, simulation bounds, report export, offline provenance, valid/invalid CSV imports, reset, and mobile navigation.
- Two scoped policy workflows: stacked discounts and shipping overruns. Official-domain filters and generic queries keep private CSV data out of search; source excerpts are untrusted data, not instructions. Citation IDs are validated, with visible no-result/error states.
- Source-linked remediation separates documented policy, analyst inference, user-provided costs, and uncertainty. Publication/retrieval dates are kept separate from effective dates.
- See `evidence/verification.md` for executed counts; do not claim tests that were not run.

## Feedback on Nebius (verified scope)

The documented OpenAI-compatible endpoint and model-list API made the adapter straightforward to isolate behind a small server module. The public model catalog provides a concrete NVIDIA candidate. JSON mode still needs application validation for references, allowed claims, refusal, and truncation.

Tavily's domain restrictions, returned URL/content/score fields, request IDs, and optional usage credits provide the needed evidence surface for a narrow policy-check workflow. Auth, rate/quota/cap responses are handled explicitly. These observations come from documentation and mocked connector tests; one real local free-tier request has now been observed: 1,682 ms and one usage credit. It returned an official Shopify POS exception that supports redirecting a generic settings check to a manual-override audit, subject to plan and transaction applicability. This single case is not a relevance benchmark.

A single Tavily source case has been reviewed; broader source fidelity, actual NVIDIA response quality, JSON compatibility for this exact model, actual inference latency, and cost remain untested. Replace this paragraph with observed feedback only after the authorized live calls. Do not invent a success story.

## Submission and judge-access plan

Deadline relayed from verified official rules: **October 30, 2026 at 17:00 UTC**. Preserve free judge access through **December 15, 2026**. Parent retains responsibility for final rules review and the user's eligibility/entry details.

| Required item | State / concrete plan |
| --- | --- |
| Working local source | This workspace; `npm ci --ignore-scripts`, `npm run dev` |
| Test/build URL | Local `http://127.0.0.1:3000`; not remotely accessible |
| Genuine NVIDIA-on-Nebius runtime call | Pending approved credentials/credits and explicit authorized test |
| Genuine Tavily runtime search | Completed one authorized local free-tier request; see `evidence/tavily-live-proof.json`. Hosted key configuration and the complete NVIDIA/Tavily workflow remain gated |
| Public runnable demo | Pending approval; deploy built frontend + Node server on a chosen host with HTTPS, approved server-only secrets, an explicit allowed origin, request budgets and persistent abuse controls. Adapt loopback-only checks before hosting. Maintain a free demo and reserved inference allowance until December 15. Do not require judges to buy credits. |
| Public repository | Pending approval; publish this isolated source with MIT license, lockfile, README, demo fixture and tests. Exclude `.env`, caches, local browser traces containing unrelated data, and any secrets. |
| Reproducible setup | README, package lock, `data:generate`, `evaluate`, unit/API/browser tests |
| Demo video <3 min | Script in `demo-script.md`; recording/upload pending |
| English description / screenshots | Draft above; local browser screenshots under `evidence/` when verified |
| Final submission | Pending user/parent review of rules, team, model proof, public links, and all required fields |

No account was created, payment made, public repository published, deployment performed, or entry submitted as part of this build. Do not list placeholder public URLs as existing deliverables.

## Release claim ledger

Observed: exact synthetic math; collision-safe entity IDs; delayed-response guards; bounded editable assumptions; twelve fixture decision cases; portable standard-API Worker; one genuine Tavily request with an applicable manual/POS exception. The decision card cites the operative source, separates seller assumptions from policy, and holds unknown/wrong-region cases.

Pending: genuine NVIDIA-on-Nebius call, controlled/human-reviewed live evaluation, actual hosted public smoke tests, the correct public GitHub commit, final live video review/upload, and Devpost submission approval. Structural source IDs are not proof that every model policy statement is supported. Real-world impact remains a product hypothesis; no customer savings, production users, accuracy scores, or award probability are claimed.

Freeze all submitted repository/video/material versions at October 30, 2026, 17:00 UTC. Record exact identities in `RELEASE.md`; do not automatically push or redeploy changed submitted artifacts afterward.
