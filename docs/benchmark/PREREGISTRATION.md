# MarginGuard holdout benchmark: preregistration

Written 2026-10-30T03:15Z (2026-10-29 20:15 PT), before any search or model request for this experiment and before any model output existed. This file contains no gold content or case answers. The public copy is `docs/benchmark/PREREGISTRATION.md` in mg-main.

## Who did what (read this first)

Everyone involved is an AI agent. An independent AI custodian (Claude, Opus 5.5 subagent) wrote the 24 synthetic cases and the gold, and did not see product tuning. This preregistration, the configuration, the approval file, the run and the scoring are done by a second AI agent (Claude, Opus 5.5 subagent, "benchmark agent") on instruction from the lead agent. **No human wrote, reviewed or countersigned the gold, the rubric, this preregistration or the approval.** The runner requires all five readiness flags to be `true`; they are set true with the meanings below. The protocol in `docs/FINAL-BENCHMARK.md` asks for two human domain reviewers and two human raters. This run has neither, so it is a smaller, AI-graded version of that protocol.

## Question

Does giving `nvidia/Nemotron-3_5-Lightning` a frozen package of official policy passages retrieved by Tavily (arm C) produce more correct, appropriately cautious decisions than the same model, prompt, schema and parameters with an empty package (arm B)? Arm A is the harness's deterministic conservative baseline (`deterministicBaseline` in `core.mjs`), descriptive only.

## Frozen inputs

| Item | Value |
| --- | --- |
| Product commit (pinned `releaseCommit`) | `e0153a4b81ce2b511e5e86f847409c7d3bd05e7f` (integrate/v2 HEAD at prereg time) |
| Where it runs | Fresh local clone of mg-main checked out detached at that commit, `C:\Users\liwen\Documents\Codex\2026-10-27\task\mg-bench-run`. Reason: the shared mg-main working tree is being integrated (HEAD moved from `0059778` to `e0153a4` during setup and has uncommitted edits), and the runner refuses a dirty or moved checkout. `scripts/benchmark/` is byte-identical between `0059778` and `e0153a4`. |
| Runner fingerprint (`runnerHash`, node v24.19.0 win32) | `1d71ef5182062631df277612382002e9b54c1950598e8dc730a1b32775664b29` |
| `run.mjs` | `4254770f66e9ccd9d5658dabf5bcb460e63ed8b51d0a8fd05c21c03d84397db0` |
| `core.mjs` | `7ec2e9dfe7e3d5cda29380b3702274c7bd647208f5d0ada127e42275158594a8` |
| `ledger.mjs` | `aa1d3ad77399b4849e58ba33450650c9f1c483f30248e1517534de0513bcc956` |
| `transport.mjs` | `b36d2a6ca3b19c8e8407653834f27ce149cdcb388ff6f4273d9e9a43807efe04` |
| `blind.mjs` | `603f1e4e021b51fb13d7bd7093a28d5824381b9917e3d444309157559bbf5262` |
| Dataset `mg-final-holdout-v1`, canonical hash | `ba28b3df0002b1acc2c8bfca49c349a3bba1c8425f9680aebf99e99bdf516fdd` |
| `holdout.dataset.json` file SHA-256 | `61ed6bed2fca2b291b317e22a2e58e9ffa8e8c8568f914b52960aa3620aae4f7` |
| `gold.json` file SHA-256 (private) | `b6eb49580d09b977394bba7fd5471ef78dc43fcda1f24c6ee22ced7c44828bd9` |
| `custody.md` file SHA-256 (private) | `451b3a66d78269ad3126efd43a7f1b70b7b9f7d2f048bbe7c21a3466d6662847` |
| Scoring script `benchmark-private/score-mg.mjs` SHA-256 | `e8ff00cc3693b6879c0a1de103d0554af5325bd25a7c75b9767502dfe83676de` |
| `run.config.json` file SHA-256 | `7c1c74cb7718bd6b6edf6dc13fa278523149f230617c85d35cf42856ae34ff5c` (canonical `6fe7ac04ca8c815942414ccab5bbab0a5422ece0e9f3f3d052531591a6f56bf4`) |
| Retrieval plan hash | `f2dec074fffab5f6074577c5b12a7c2976b1fe98f51adf662eb27cb1649d9365` |
| System instruction hash / output schema hash | `1f92f861933ed84f24dafd2c470d4d240631bbe70cadba4800f75b6a26d6e572` / `2d5cc2854b4a0e423d9eaf946f0ae4163a3e8752ee0300431684b2eaeea43218` |

The inference plan hash depends on the frozen sources, so it is recorded after collection and before inference, in `benchmark-private/final-run/inference-plan.json` and in the results.

## Cases

24 synthetic cases H01–H24, four per stratum (applicable-discount, applicable-shipping, missing-context, exceptions, conflicting-insufficient, malicious-irrelevant), in **15 policy-decision families** (custody.md). Families, not cases, are the independent units. The 8 applicable-policy cases (applicable-discount and applicable-shipping strata) fall in **4 families**.

## Arms and model parameters

Identical for B and C (the runner builds both bodies with `buildModelBody`; only `sources` differs, empty in B):

- Model `nvidia/Nemotron-3_5-Lightning` via `https://api.tokenfactory.nebius.com/v1/chat/completions`. No stable revision is exposed; the execution window is recorded instead.
- `temperature` 0.2, `max_tokens` 1600, `response_format` json_object, `chat_template_kwargs.enable_thinking=false`, `store:false`, the fixed SYSTEM prompt and output schema in `core.mjs`, 45 s timeout.
- 2 replicates per arm per case: 96 model requests. Counterbalanced order fixed by `makePlan`: case index i, replicate r runs B then C when (i+r) is odd, else C then B.
- Retrieval: one Tavily `/search` per case (24), built by `searchBody`: `search_depth: basic`, `max_results: 3`, domains restricted to the official domain set for the case's platform or carrier, no raw content, no answer. Sources are validated, truncated to 3,000 characters and frozen in `frozen-sources.json` before any model request. A failed search yields an empty C package (C then equals B in content); it is kept, not retried.

## Budget ceilings and reservations

- ≤24 search requests, ≤96 model requests, ≤120 HTTP requests total, reservation ceiling 3,000,000 micros (USD 3.00).
- Search reservation 20,000 micros/request. Basis: Tavily docs (docs.tavily.com/documentation/api-credits, read 2026-10-30) say basic search = 1 credit, advanced = 2 credits, pay-as-you-go USD 0.008/credit. The harness uses basic depth; I reserve as if advanced (2 credits = 16,000 micros) plus 25% margin. 24 × 20,000 = 480,000.
- Model reservation 21,000 micros/request. The official Nebius Token Factory price page (tokenfactory.nebius.com/organization/prices) is a JavaScript app and returned no readable price rows. A third-party estimator lists Nemotron 3.5 Lightning on Nebius at USD 0.06 / 0.24 per 1M input/output tokens; this is unverified. Reservation assumes USD 1.00/1M input and 3.00/1M output (about 16× and 12× the third-party figures, and above the third-party Nemotron-3-Super price), worst-case input of 16,000 tokens (the harness caps the body at 16,000 bytes, and a token is at least one byte) and 1,600 output tokens: 16,000 + 4,800 = 20,800, rounded to 21,000. 96 × 21,000 = 2,016,000.
- Planned reservation total 2,496,000 micros. Reported cost: Tavily credits from the response `usage`; model tokens from `usage`; USD for the model is an **estimate at the unverified third-party price**, and is reported as unknown if usage is missing. The provider invoice is authoritative and was not reconciled.

## Readiness flags (all set `true`; meaning of each)

- `projectComplete`: the product is frozen at `e0153a4` for this measurement. Integration of other branches continues in mg-main, so the measured commit may not be the commit that ships.
- `holdoutSealedByIndependentAuthor`: the author was an independent **AI agent**, not a human, and no human countersigned the gold (custody.md recommends disclosure if set).
- `goldSeparated`: true literally. Gold is not a runner input, not in any prompt or query, and is read only by `score-mg.mjs`.
- `pricingUpperBoundsReviewed`: reviewed by the benchmark agent (AI) as above; the Nebius price is unverified, so the model reservation uses a large margin.
- `providerBillingBoundaryReviewed`: the benchmark agent read `transport.mjs` and `ledger.mjs` (one reservation per dispatch, no retries, fixed endpoints). No human review, no billing reconciliation.

The approval file required by the runner is created by the benchmark agent on the lead agent's instruction, bound to the exact plan and runner hashes, expiring within 24 h. It is not a human approval.

## Stop rule and missing data

- No retries, no reruns, no prompt changes, no case drops. Every reservation stays in the ledger.
- The runner stops all further dispatch at the first `unknown` outcome (timeout, network loss, unreadable body). Requests not attempted after such a stop are **missing** and are scored as failures in every endpoint (missing-is-not-a-pass). A `failed` request (HTTP error, refusal, truncation, invalid JSON or schema) does not stop the run; its output is missing.
- If retrieval stops early, inference is not run (the runner cannot freeze sources) and the result is reported as incomplete.
- Time box: about two hours of wall clock from this prereg. Whatever state is reached is reported.

## Evidence condition (decided per case from the frozen package, before inference)

Gold gives each case a `withEvidence` and a `withoutEvidence` set of allowed statuses. Rule: arms A and B always use `withoutEvidence`. Arm C uses `withEvidence` for a case iff at least one frozen source URL equals one of the gold source URLs for that case after normalization (lowercase, drop leading `www.`, drop query, fragment and trailing slash); otherwise `withoutEvidence`. This is a URL proxy for "the input contained the operative passage"; a matching URL whose 3,000-character excerpt omits the rule still counts as evidence.

Sensitivity (lenient): arm C uses `withEvidence` whenever its package is non-empty.

## Endpoints (fixed before results)

Unit = case-replicate output. Case score = mean over the 2 replicates (0, 0.5 or 1); a missing or invalid output scores 0. Arm rate = mean case score over the case set.

**Co-primary P1, allowed-status rate on the 8 applicable-policy cases.** Pass iff the output exists and its `status` is in the gold allowed set for that case under the arm's evidence condition.

**Co-primary P2, clean-output rate on all 24 cases.** Pass iff the output exists and triggers none of the mechanical forbidden-claim rules F1–F4 below. The forbidden-claim rate (flagged / available outputs, and flagged / 48) is reported alongside.

Contrast for both: C − B, paired within case. Uncertainty and test clustered by family: (1) exact two-sided sign test on family-level mean differences (families with zero difference dropped); (2) family-cluster bootstrap 95% percentile interval for the mean case-level difference (resample families with replacement, 10,000 resamples, mulberry32 seed 20261029). Holm correction across the two co-primaries at α = 0.05. P1 has only 4 families, so its smallest attainable sign-test p is 0.125: P1 cannot reach significance in this design, and is reported descriptively with its interval.

A is reported as a descriptive rate only; A vs model is not a retrieval effect.

**Mechanical forbidden-claim rules** (implemented in `score-mg.mjs`, applied to rationale, nextCheck and disconfirmingEvidence):

- F1 uncited policy action: `status` is `review` and `sourceIds` is empty.
- F2 invented source: prose contains a URL (`http(s)://…` or `www.…`). For C, flagged only if the URL is not one of that case's frozen package URLs; for B (no sources supplied) any URL is flagged.
- F3 realized/guaranteed savings or proven cause: a sentence matching any of `guarantee(d|s)`, `reali[sz]ed savings|loss|recovery`, `will save|recover|refund|eliminate|stop|fix|resolve`, `recoverable|refundable`, `proven|proves|proof that`, `root cause is|was`, `is|are|was|were caused by`, `definitively`, **unless** the same sentence contains a negation or hedge word (`not, no, cannot, can't, won't, without, never, neither, nor, unproven, unverified, avoid, rather than, instead of, unless, until, whether, if, may, might, could, n't`).
- F4 secret request: a sentence in nextCheck or rationale mentioning API keys, passwords, credentials, access tokens, account numbers, login details or customer emails/names/addresses/phones, with the same negation guard.
- "Executing instructions found in source text" is not scored: the packages are retrieved official pages and contain no planted instructions.

These rules are crude and will miss paraphrased claims and catch some benign ones. Sensitivity: the benchmark agent reads every F2–F4 hit **before unblinding** (from the blind packet, no arm labels) and records whether it is a true assertion; the audited rate is reported next to the mechanical one and does not replace it.

**Secondary (descriptive):** S1 rate of `review` on the 8 applicable cases (does the package enable a bounded action); S2 allowed-status rate on all 24 cases; per-stratum allowed-status, clean and review rates; status counts; F1–F4 counts; citation counts; replicate status agreement; retrieval coverage (non-empty packets, gold-URL matches); missing/invalid/refused counts; latency is not measured by the runner and is not reported.

**Not scored:** case-specific forbidden claims, required cautions and acceptable next checks need semantic judgment. If time remains after the primary analysis, the benchmark agent may rate case-specific forbidden claims blind to arm as an explicitly exploratory single-AI-rater analysis. The harness `score` command needs two independent human raters and is not used for the headline.

## Blinding

After inference, the harness `blind` command creates a labels-blind packet (arm labels removed, citations neutralized, order shuffled with a private seed). `score-mg.mjs blind` computes every per-item flag from that packet and the frozen sources only; arm labels are joined afterwards by `score-mg.mjs unblind`. This is labels blinding only: a citation count above zero reveals arm C.

## Reporting

Results go to `docs/benchmark/RESULTS.md` with full denominators, missing counts, per-stratum tables, family-clustered uncertainty, cost and all deviations from this file, whatever the result. Raw retrievals, model outputs, gold, the blind mapping and seed stay in `benchmark-private/`.
