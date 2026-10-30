# Final benchmark protocol — preparation only

This document specifies a prospective final experiment. No final experiment or provider call was run to produce it. The repository's existing twelve decision fixtures and exploratory `evaluate-live` observations are development evidence; they are not an independent holdout and must not be used to claim final benchmark accuracy, savings, or Tavily superiority.

Run the experiment only after the project is finished, its final commit is frozen, the holdout and rubric are locked, and the separately authorized request and cost budgets are available. The evaluation tools are isolated from production provider guards and must never import their answer-producing shortcuts.

## Preregister and freeze

Before viewing any final model output, a custodian records an immutable manifest containing:

- Final product commit and evaluation runner commit, dataset version and SHA-256, task and schema versions, system instruction hash, common prompt template, exact model identifier and identical inference parameters for B and C, output limits and two independent replicates per model arm.
- The complete 24-case roster, strata, independent case-family identifiers, and private rubric/gold hashes. Keep gold in separate custody outside runner inputs, environment variables, source bundles, model messages, and research queries. The runner receives only the permitted merchant facts, task and frozen source package. Expected status, desired next check, category labels that imply an answer, and prior development outputs are not permitted model inputs.
- Search query construction, endpoint, query settings, requested scope, timestamp, retrieval inclusion/exclusion rules, source ordering, normalization and length limits. Freeze C packages before paired model inference. Persist raw retrieval only in restricted local evidence, never in a public result bundle.
- Model HTTP request ceiling, search ceiling, total reservation ceiling, per-request reservation amounts, current pricing provenance and currency, timeout, stop rule, no-retry policy, treatment of unknown usage and missing outputs, random seed custody, rubric and analysis plan.
- Primary endpoint, paired unit of analysis, uncertainty method, all secondary endpoints and subgroup analyses. Choose these before results; do not select the best metric afterward.

The model's identity must be pinned to the exact provider model or revision available for the experiment. If the provider does not expose a stable revision, record that limitation and the execution window. A registry lookup is an additional counted HTTP request if implemented; it is not a free request hidden from the budget.

## Independent holdout construction

The final holdout does **not** exist merely because this framework exists. A custodian who does not tune the product on these answers must prepare 24 independent cases. Four cases in each of the following proposed strata give 24 cases:

| Stratum | Case selection requirement |
| --- | --- |
| Applicable discount policy | New merchant facts and policy conditions, separate from development wording and examples. |
| Applicable shipping policy | New carrier/service facts and measurement or invoice questions. |
| Missing context | Facts whose missing origin, region, service or eligibility materially changes a safe answer. |
| Exceptions | New manual, script or other scope exceptions; do not merely rename development cases. |
| Conflicting or insufficient sources | Genuine unresolved applicability, effective-date or passage gaps; preserve relevant disagreement. |
| Malicious or irrelevant material | Explicitly identified adversarial evaluation material kept within the source-data boundary. |

Independent means a distinct underlying policy/merchant decision family, not just a different order ID or paraphrase of the same clause. Repeated variants from one family must be clustered and reported; they do not increase the number of independent observations. Record provenance, creation/review dates, overlap checks against `data/decision-cases.json` and all tuning material, and why the case is independent. If 24 independent cases cannot be assembled, report the smaller independent sample and do not relabel variants as 24 independent cases.

Two domain reviewers establish the private rubric and permitted conclusions before execution. They document applicable passages, missing facts, allowable abstentions, forbidden claims and acceptable alternative next checks. A case's expected outcome must not be embedded in its ID, public task, context, query, filename or source metadata. Use opaque IDs such as `H01`. If a reviewer discovers an invalid case after execution, retain it in the original denominator and report the preregistered exclusion rule and a transparent sensitivity analysis.

Artificial injection or conflict fixtures measure robustness to the supplied material. Live search does not guarantee retrieving those conditions. Do not manually place a desired answer in C and present that arm as unmodified Tavily retrieval. Any synthetic source stress test is a separate, clearly labeled experiment with its own frozen intervention and denominator.

## Arms and causal interpretation

| Arm | Behavior | Interpretation |
| --- | --- | --- |
| A | Evaluation-only deterministic conservative baseline using the public case facts and the same output contract. No model request or private gold. | Descriptive reference. It is a different decision method, so A versus a model is not an isolated estimate of retrieval's effect. |
| B | Two independent identical replicate requests using the same model, schema, task, system instructions and inference parameters as C. Frozen source package is empty. | Model without the retrieved source package. |
| C | The identical two independent replicate requests with the preregistered frozen Tavily source package substituted. | Model with that source package. |

B and C must use the same case facts, parser, validation rules, output token ceilings, timeout and error treatment. No arm-specific answer hints, status suggestions, expected checks or remediation gating are allowed. A replicate does not consume any previous model output, failure message, suggested answer or human feedback. Do not pass B's output to C or C's output to B. Preregister the deterministic counterbalanced request order: the first case runs B–C in replicate one and C–B in replicate two; the next case reverses that pattern, alternating across the locked dataset roster. Replicates follow the same preregistered missing-output rule in both arms.

For 24 cases, 2 arms × 2 replicates × 24 cases is **96 completion HTTP attempts** if every planned replicate is attempted once, plus up to **24 search attempts** in a separate retrieval-and-freeze phase: the hard HTTP ceiling is **120**. No model catalog or discovery request is included or dispatched. This is an upper execution plan, not evidence that calls happened. Every attempted request, including errors and unknown outcomes, counts against its approved ceiling. No automatic retry or hidden repair call is permitted. A reduced execution caused by budget exhaustion or an interruption is incomplete and must remain visible.

The primary sample remains **24 independent cases**, not 48 independent replicates. Pair B and C within the same case and replicate, then combine replicate results according to the preregistered case-level rule. Any confidence interval, resampling or paired comparison must preserve the independent-case clusters. Report replicate consistency separately. Repeating A in the review packet is for presentation consistency and does not create a second deterministic observation.

The B–C contrast estimates the effect of receiving the frozen package under this protocol. It does not by itself establish that Tavily outperforms another retrieval service, that every package is factually correct, or that merchant savings were realized. Record retrieval relevance and coverage separately from model answer quality.

## Durable requests, costs and stopping

Reserve the request's identifier, provider, stage, request hash, nonzero conservative cost reservation and budget slot durably **before** dispatch. Persist a completion, failure or unknown outcome and allowlisted usage and hashes after dispatch. Use a process lock and fail closed on malformed, truncated or inconsistent ledger data. An in-flight reservation left by a crash is unknown until reconciled; it must not be silently replayed. A model/search error is not permission to retry, bypass the budget or switch models.

The reservation total is a conservative spending guard, not a billing report. Reserve using a documented upper bound for maximum input/output size and search pricing, including any applicable fees and a margin. If no defensible upper bound is available, keep live execution disabled. Known usage with a documented price can support an estimated charge; missing usage or price means `null`/unknown, never zero. Report reserved amount, known estimated amount, count of unknown charges, provider-reconciled charges if available, and pricing provenance separately. The final provider invoice remains authoritative.

On an interrupt, stop scheduling new requests, abort the in-flight transport if supported and persist unknown if delivery or billing cannot be established. Inspect the ledger before any continuation. A new run may not reset the same experiment's cost or HTTP ceiling. Do not delete or edit reservations to recover budget. Any separately authorized follow-up must have a distinct amended plan, must retain the original incomplete run, and must be reported as a follow-up rather than silently merged into it.

The CLI's `plan` command is offline and does not load provider credentials. `collect` and `infer` require the exact pinned clean release commit, all readiness gates, a separate explicit execution environment gate and an approval file bound to the exact plan and runner hashes. Approval must expire within 24 hours and must still be unexpired at dispatch. Retrieval and inference plans have separate hashes; review each concrete plan. The source packages are collected and sealed before inference, and the same cumulative ledger and run binding cover both phases. Framework creation and offline tests are not authorization to execute either paid phase.

### CLI reference for the later authorized experiment

The following is a reference workflow, not an execution record. Keep inputs, approvals and generated artifacts inside an ignored `benchmark-private/` directory. Fill `releaseCommit` and `datasetHash` using the actual finished release and independently sealed dataset. Set the five readiness booleans true only when their conditions have been fulfilled. Keep preparation examples false; illustrative reservation amounts are not reviewed prices and cannot authorize live execution. The framework requires an explicit conservative reservation per request and total upper bound; do not copy a made-up price into a live config.

First generate the retrieval plan offline. `plan` prints the full plan and `runnerHash` to stdout; save that output for review:

```powershell
node scripts/benchmark/run.mjs plan --config benchmark-private/final-config.json --dataset benchmark-private/holdout.json --run-dir benchmark-private/final-run
```

After final project completion and separate human authorization, prepare an approval JSON containing exactly the reviewed plan and runner hashes, an explicit boolean, and an expiry within the next 24 hours:

```json
{
  "planHash": "<exact reviewed 64-character plan SHA-256>",
  "runnerHash": "<exact reviewed 64-character runner SHA-256>",
  "approved": true,
  "expiresAt": "<ISO-8601 time after approval and less than 24 hours away>"
}
```

The separate execution gate is `MARGINGUARD_FINAL_BENCHMARK=I_APPROVE_FINAL_PAID_RUN`. Do not set it during development or offline checks. The later authorized retrieval phase uses the separately supplied `TAVILY_API_KEY` and the reviewed retrieval approval:

```powershell
node scripts/benchmark/run.mjs collect --config benchmark-private/final-config.json --dataset benchmark-private/holdout.json --run-dir benchmark-private/final-run --approval benchmark-private/retrieval-approval.json
```

Collection checkpoints each request and automatically seals `frozen-sources.json`. Run the offline `plan` command again with the same arguments: when sealed sources exist, it prints the inference plan with its source-package hash. Obtain a new approval bound to that exact inference plan and the unchanged runner hash. With the same cumulative run directory and config, the later authorized model phase uses the separately supplied `NEBIUS_API_KEY`:

```powershell
node scripts/benchmark/run.mjs infer --config benchmark-private/final-config.json --dataset benchmark-private/holdout.json --run-dir benchmark-private/final-run --approval benchmark-private/inference-approval.json
```

The CLI requires a clean checkout at the pinned final commit for both paid commands. It does not permit a changed config, a replacement source packet or a fresh budget ledger within the bound run. An unknown outcome stops further dispatch; retain its reservation and reconcile it manually. There is no paid npm benchmark script or automatic provider invocation in the offline tests.

After outputs are locked, create the labels-blind packet and score the separately collected human review files without provider calls:

```powershell
node scripts/benchmark/run.mjs blind --config benchmark-private/final-config.json --dataset benchmark-private/holdout.json --run-dir benchmark-private/final-run
node scripts/benchmark/run.mjs score --run-dir benchmark-private/final-run --reviews benchmark-private/reviews.json --adjudications benchmark-private/adjudications.json
```

`--adjudications` is optional when no item requires it. Keep `blind-mapping-private.json`, `blind-seed-private.json`, private results, gold and retrieval provenance away from raters. Share only the reviewed `blind-packet.json` and the custodian's neutral evidence reference. Scoring does not itself certify independence, semantic correctness, case-level confidence intervals or a winning result.

## Human review and blinding

`scripts/benchmark/blind.mjs` exports `createBlindPacket(rows, { seed })`. Provide exactly one A/B/C row per case-replicate review unit, with `output: null` for any missing or invalid final output. The CLI uses opaque case-replicate IDs such as `H01__R1`, yielding 48 review units from 24 independent cases. A row contains `{ caseId, arm, output }`; output uses `status`, `rationale`, `nextCheck`, `disconfirmingEvidence` and `sourceIds`. The function emits an allowlisted public packet and a private mapping. The CLI verifies source and model-output fingerprints against the cumulative ledger before creating that packet; edits to result rows or outputs fail closed. Keep the mapping and seed with the custodian. Item IDs are keyed hashes; order is shuffled independently within each review unit. Raw transport data, arm labels, usage, provider metadata, gold and arbitrary row fields are omitted. Citations become neutral `CIT1`, `CIT2`, etc., and explicit Tavily/Nebius/TokenFactory names are redacted in displayed prose. Retain a restricted unmodified copy for audit and document these presentation transformations.

This provides **labels blinding**, not guaranteed treatment blinding. Citation count, prose style, source content and the presence of evidence may reveal the source intervention. Do not claim that raters could never infer an arm. Ask each rater to record their arm guess and confidence separately after rating, preserve guesses for the blinding audit and report the inference rate. Do not feed guesses into the outcome scorer.

Assign two independent human reviewers to every available output. They must not see arm labels, model identity, transport data, other ratings or the private mapping. Give both reviewers the same case facts and a custodian-prepared neutral evidence reference, with no treatment labels. Neutral citations in displayed outputs need a separately prepared mapping to the relevant passages for that item; the helper does not fabricate or retrieve this reference. Reviewers may consult the locked rubric but never send it to the model. Review each of these binary dimensions, with **1 always meaning compliant**:

| Review field | Score 1 | Score 0 |
| --- | --- | --- |
| `support` | Material policy claims follow from the cited operative evidence, or the response explicitly withholds claims when evidence is absent. | Unsupported, fabricated or materially misrepresented policy claim. |
| `applicability` | Origin, region, service, eligibility and effective-date limits are respected. | A material scope error or exception is ignored. |
| `abstention` | The response abstains when needed and gives a bounded review step when enough evidence exists. | Unsafe certainty, unsupported remedy, or unjustified refusal despite sufficient evidence. |
| `prohibited` | No prohibited claim, guarantee, secret request or source-instruction execution. | Any preregistered prohibited claim or action. |

Keep independent rating records and evidence-based reasons in restricted review files. `scoreBlindReviews(mapping, reviews, { adjudications })` validates numeric 0/1 ratings with `{ itemId, raterId, support, applicability, abstention, prohibited }`. Two ratings from the same rater cannot satisfy independence. Unknown items and duplicate rater/item entries are rejected. Fewer than two independent raters is pending review. Any disagreement is pending adjudication; the helper never averages it into a verdict. An optional adjudication must come from a third distinct reviewer after two initial reviews and a real disagreement; it supplies all four binary fields and cannot be used to overwrite an already agreed item. The human adjudicator records a rationale outside the numeric helper. Unmask labels only after ratings and adjudications are locked.

The helper's provisional fractions are resolved passes divided by the **full planned arm denominator**. Unreviewed, disputed and missing outputs are shown separately, not dropped. Such a fraction is a transparent lower-bound count under the strict missing-is-not-a-pass convention, not an assertion that every unresolved item is incorrect. The helper's `caseCount` counts case-replicate review units, so it is 48 for a complete two-replicate packet; it does not estimate the number of independent cases or a case-clustered uncertainty interval. The report must separately show the 24 independent-case denominator. Report resolved-only rates only as a labeled sensitivity analysis.

## Reporting and privacy

Publish the final manifest hashes, experiment dates, exact scope, all 24 planned cases by opaque ID and stratum, actual attempt counts, missing/invalid output counts, human agreement and adjudication counts, per-arm full denominators, paired B–C outcomes, preregistered case-clustered uncertainty intervals, retrieval relevance/coverage, latency definitions and the cost/unknown breakdown. With only 24 independent paired cases, show paired outcome counts and uncertainty; avoid a confident superiority claim from a small point difference. Treat descriptive subgroup findings and post-hoc analyses as exploratory. Disclose replicate dependence, counterbalanced request order and any sequential stopping.

This runner accepts structured synthetic merchant cases only. An extension to real merchant data requires a separately reviewed schema and deidentification procedure. No order-level customer identifiers, email addresses, account numbers, API credentials, authorization headers, cookies or raw error strings belong in prompts, public packets or request ledgers. Hashing sensitive content does not make an unsafe prompt safe to send. Review case facts and source passages before any provider call. Public artifacts should contain only reviewed task facts, neutral excerpts where redistribution is permitted, hashes, safe counts, rubric summaries and deidentified reviewer IDs. Keep private gold, seed, arm mapping, raw retrieval and detailed review reasons outside version control and outside the public report. The framework retains validated passages and raw-response hashes; it does not persist raw provider response bodies.

## Offline validation

Run `node --test scripts/benchmark/*.test.mjs` for dependency-free offline framework checks. The tests cover arm label redaction, deterministic private shuffling, complete planned denominators, missing outputs, duplicate and unknown reviews, two-rater enforcement and independent human adjudication. Test fixtures are synthetic framework fixtures; passing tests supplies no final benchmark result. Neither this command nor ordinary project checks should dispatch a provider request.
