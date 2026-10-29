# Development workflow

Follow [SPEC.md](SPEC.md) as the acceptance contract, [ARCHITECTURE.md](ARCHITECTURE.md) for module boundaries, and [RELEASE.md](RELEASE.md) for the submission ledger. Keep the discount-policy exception journey as the primary demonstration. Fix unmet acceptance gates before adding scope.

## Current handoff

Recorded coordination state on 2026-10-29; this document is not a fresh remote verification:

- P0: [draft PR #1](https://github.com/Allenllii/marginguard/pull/1), specification commit `29cf07a83c19d1fb229c011fb9b504d4e896c2a0`.
- P1: [draft PR #2](https://github.com/Allenllii/marginguard/pull/2), branch `codex/marginguard-source-baseline`, is complete at `17963ea70e877e73d30aa07ba8866380b41c3362`. The public tree was verified against 86 frozen local files with zero missing, unexpected or mismatched Git blobs. It remains a draft, not a merged release.
- P4: [draft PR #3](https://github.com/Allenllii/marginguard/pull/3), branch `codex/evaluation-http-budget`, isolates actual HTTP request accounting from production domain logic. Commit `1ee34063e180250e7d8189947a367a4edcb1a1d7` was verified as a complete 90-file branch with no missing, unexpected or mismatched Git blobs. The latest recorded local checks are 71 unit/API/build/migration tests, 10 browser scenarios, 12 synthetic policy cases, lint/typecheck/build and golden arithmetic checks passing. See [the HTTP-budget record](../evidence/spec-request-budget-20261029.json); its ten request-meter tests are included in the 71. The older [readiness note](../evidence/readiness-20261029.md) records 61 tests at an earlier source state. Counts must stay attached to their own source and run.
- Actual NVIDIA inference proof, public deployment verification, final independent review and the final benchmark remain open. The benchmark is **NOT RUN**. Historical local Tavily proof does not close the NVIDIA or hosted integration gates.

## Ownership and parallel work

Before a task starts, record its owner, acceptance IDs, allowed files, base commit, dependencies and reviewer in the task/PR. One active owner writes each file. Parallel work is appropriate only when those file sets and contracts do not overlap. The integration owner assigns shared-file changes and resolves dependency order; another owner requests a handoff before editing them.

| Workstream | Owned files / responsibility | Boundary to preserve |
| --- | --- | --- |
| Deterministic analysis | `server/analysis.ts`, `shared/assumptions.ts`, analysis fixtures/tests | Exact cents, source rows, stable IDs and bounded assumptions; no provider transport |
| Policy decision | `shared/policy-decision.ts`, policy fixtures/runner | Applicability, status, supporting IDs, next check and disconfirmation; model output has no verdict authority |
| Provider adapters | `server/tavily.ts`, `server/nebius.ts`, `server/http.ts`, adapter tests | Fixed destinations, bounded transport, supporting-only evidence, truthful errors/provenance; no money mutation |
| Service and budgets | `server/service.ts`, `server/budget.ts`, budget/API tests | Validate and orchestrate shared use cases; reserve attempts before work; no raw CSV persistence |
| UI and interruption safety | `src/App.tsx`, `src/PolicyResearch.tsx`, `src/styles.css`, browser tests | Explicit context/consent, generation and abort guards, evidence presentation/export; no duplicate financial or eligibility rules |
| Runtime and packaging | `server/app.ts`, `server/index.ts`, `worker/entry.ts`, build scripts, schema/migrations | Node and Worker use the same implementation; reproducible assets, durable hosted state and immutable migration history |
| Evaluation preparation | `scripts/evaluate-live.ts`, `scripts/lib/request-meter.ts`, meter tests | Evaluation-only request accounting and frozen-input preparation; no public endpoint or automatic final run |
| Integration coordination | `shared/types.ts`, `package.json`, lockfile, shared test files and release documents | One agreed additive contract and coherent candidate; no concurrent incidental edits |

Tests belong to the owner changing their behavior. Split shared `tests/api.test.ts` or `tests/browser.spec.ts` work by an agreed handoff, not simultaneous writes. A change crossing boundaries stays one cohesive task or is split behind a reviewed contract; do not create incompatible local variants.

## Phase acceptance

Sequence: P0 -> P1 -> P2/P3/P4 -> P5 -> P6 -> P7 -> P8. P2-P4 may proceed in parallel after their base and file ownership are agreed; each must pass on the combined candidate before P5 closes. Each row is a narrow branch and draft PR; a later correction gets its own focused PR.

| Phase | Reviewable deliverable | Exit evidence |
| --- | --- | --- |
| P0: contract | Specification and final-evaluation protocol | Goals, F01-F12 contracts, held-out case plan and release gates declared; exact docs commit and draft PR |
| P1: source baseline | Complete allowlisted source publication | Source/config/lockfile/synthetic data/license/schema/history present; no excluded material; build and recorded regressions reproduce; full published commit/tree matches the reviewed manifest (F12) |
| P2: decision journey | Focused policy/UX change | Native and manual/app counterexamples produce the correct different next check; unknown/wrong-region hold; negative/conflicting evidence abstains; only supporting passages appear in prompts, citations and exports (F04-F06, F11) |
| P3: state and failure experience | Focused UI/service state change | Retrieval/model status independent; repeated clicks, cancel/reset/import/context change, delayed responses and timeout paths remain truthful; export belongs to the current generation (F09-F11) |
| P4: accounting and harness | Focused HTTP-budget correction and evaluation preparation | Actual catalogue/completion HTTP attempts bounded and counted separately from logical operations/tokens; no automatic retries or secret logs; fixture regressions pass; final benchmark still NOT RUN (F07-F08) |
| P5: runtime integration | Authorized real integrations and public deployment | Exact NVIDIA model catalogue and valid completion proof; real Tavily workflow proof; code/deployment IDs; migrated durable D1 budget, verified provider hard caps, unauthenticated asset/API/journey smoke and free judge access through December 15 (F05, F07-F09, F12) |
| P6: independent review | Whole-project review plus focused fix PRs | Reviewer did not author the implementation; technical/design/impact/originality each assessed out of 25 with evidence, severity and prioritized defects; affected checks and independent re-review close high-severity defects |
| P7: final candidate | Frozen candidate and final benchmark | P1-P6 complete; SPEC section 9 preregistration and held-out labels frozen; explicit request/token/credit cap and configured-credential approval; complete paired outputs, failures, usage and independent grading retained |
| P8: submission materials | Final English description/testing instructions and video under three minutes | P7 outcomes reconciled with every claim; actual UI recording distinguishes fixtures from live proof; exact artifact versions; user reviews public video/entry before submission |

A passing local test run does not close P5-P8. A draft PR does not close publication, review, merge or deployment gates. If a platform action is blocked, record the exact action, target, reason and denied/pending/uncertain status; continue independent local work without bypassing the block.

## One change, one reviewable draft PR

1. Start from a verified base. Record the exact base SHA and the files/acceptance IDs assigned to this step. Use a narrow `codex/marginguard-<step>` branch in the publication checkout. A non-Git source export has no commit identity until its complete allowlisted contents are verified there.
2. Implement the smallest cohesive change and inspect its diff. Preserve shared contracts, source/fixture labels and runtime safety defaults. Keep HTTP-budget changes distinguishable from the source-publication baseline in their own focused review.
3. Run the checks warranted by the change below. Save commands, results, source identity and remaining gates. Run the combined regression suite when integrating dependent changes.
4. Create a **draft** PR against `Allenllii/marginguard`. Lead with the problem and resulting behavior; list acceptance IDs, actual checks and open gates. For a dependent PR, set its explicit base branch and record the base commit and blocking PR URLs. Do not force an unreviewed stack onto `main`.
5. Verify the published head and complete tree against the intended local commit/allowlist. In a Git checkout, record `git rev-parse HEAD` and `git rev-parse 'HEAD^{tree}'`; read back the PR head/tree after publication. A root-only upload or matching commit message is insufficient. For browser/API uploads without a local commit, reconcile every allowlisted path/hash with the published tree and record that manifest.
6. Give the reviewer the evidence below. Do not auto-merge. When a dependency changes, update the stack deliberately, rerun affected checks on its new base and reverify the published head/tree. After review, the integration owner assembles one coherent tested commit for deployment and freeze.

## Verification and review artifacts

Development checks can run throughout implementation with offline fixtures and mocked provider transport:

- Narrow unit/API regressions: `npm test` or a focused existing test file; reproduce the defect where applicable. Check exact money/row invariants for domain changes and reservation/timeout/unknown-outcome behavior for provider changes.
- Full local regression: `npm run check` covers lint, strict typecheck, frontend/Worker builds, unit/API/build/migration tests, golden synthetic evaluation and the twelve policy fixtures. `npm run test:ui` separately covers production browser journeys and interruption safety. Record the actual counts for that source; never add counts from different runs.
- Public/live checks require their own authorized runtime evidence. Mock calls, fixture UI screenshots, local Worker smoke and configured keys are not proof of successful provider inference or public deployment.

The final benchmark is a separate, gated experiment under SPEC section 9. Do not run `evaluate:live`, real-provider verification scripts or any replacement final runner as an ordinary regression command. Prepare the harness/cases now; freeze and run only after P1-P6 and the explicit budget/credential approvals. Do not label the twelve development cases held out, call replayed packets fresh retrieval, or turn local test counts into a final score or winning probability.

Each review handoff contains:

- Draft PR URL, base/head/tree identities, dependencies, allowlisted changed files and acceptance IDs.
- Exact check commands, source/data/assumption/context identities, outcomes and known limitations; redacted request IDs/model/usage only when observed.
- Synthetic-only UI/export evidence for the affected journey, plus any failure reproduction and independent review disposition. Reuse existing captures where sufficient; defer new media production to P8.
- Remaining gates and next owner. A PR description must not claim integration, deployment, independent review or final evaluation that its evidence does not establish.

## Publication hygiene and freeze

Never read, edit, copy, stage or upload existing ignored `.env.local` or other credential files as development/publication work. Keep credentials in approved server runtime configuration. Exclude real orders, private account/payment diagnostics, browser profiles, caches, `node_modules`, local logs with sensitive contents and private transfer receipts from commits and source archives. Inspect an explicit allowlist and scan the staged diff/build before publication; do not stage the entire workspace blindly.

Defer new recordings, narration, video editing and final presentation/submission materials until the implementation, real integrations, deployment, independent review/fixes and final benchmark gates are complete. Existing exploratory media is not final evidence and does not belong in the source-baseline upload. Continue code, fixtures and review preparation while an external integration gate is open.

**Freeze is 2026-10-30 at 17:00 UTC.** Before it, fill the release ledger with the final source commit/tree, archive/data hashes, deployment version, benchmark identity and video/submission versions. Preserve free judge access through 2026-12-15. Disable automatic publication/deployment updates; no automatic post-freeze changes to submitted source, deployment, video or entry. If a gate is still open at freeze, report it honestly rather than filling the ledger with unobserved success.
