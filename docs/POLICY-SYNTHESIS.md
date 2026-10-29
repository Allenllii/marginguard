# Complete, bounded policy drafts

This phase follows PR #5's actual development observation: a valid source ID and a `stop` finish did not prevent a long copied excerpt ending with an unfinished clause. The earlier broad prose-format experiment was withdrawn. Its observations remain historical; they do not establish success for this revision.

## Regression before implementation

Seven authored reproduction tests were run against the previous adapter first: two passed and five failed. They reproduced long source copying, a dangling policy clause, unsupported policy assertions with valid IDs, incomplete/copied analyst fields, and missing safe fallback. `evidence/policy-prose-red-20261029.log` retains that red run. The fixtures reproduce failure shapes without copying the official passage.

## Contract and boundaries

`server/policy-draft.ts` now owns the policy-output schema and limited policy-scope statements. Only sources selected by the conservative applicability router receive a permitted statement. The statement describes a manual exception, app/script exception, combination/coupon condition, or carrier condition; it does not certify semantic entailment, account eligibility, effective dates or root cause. Unknown/region-mismatched/conflicting/insufficient evidence remains held.

The NVIDIA prompt receives those permitted source/statement pairs. It selects a supported pair and supplies the analyst rationale, a specific validation step and uncertainty. It cannot replace the policy scope with its own assertion or paste the source excerpt into that field. Source previews retain the original excerpt for inspection. The schema and claim validator reject unsupported pairs and duplicate citations.

Analyst fields reject the observed dangling-clause suffixes and long source copying. No terminal punctuation or new forty-word limit is imposed. Complete sentences ending in a preposition remain accepted. These are bounded checks for observed failure shapes, not a complete grammar or semantic verifier. Invalid output returns visible offline checks, no live-success proof, and no automatic repair request. Offline fallback uses the same complete scope statements instead of republishing a truncated excerpt. Harmless whitespace and terminal punctuation normalize to the supplied controlled statement; arbitrary content is never silently trimmed or repaired.

The provider adapter owns HTTP/model controls; the pure policy-draft module owns the output contract; the router owns applicability; the UI owns lifecycle/consent and shows limited scope separately from model inference. Integer-cent calculations are unchanged.

## Verification and actual-browser operator command

`npm run check` verifies lint, strict types, frontend/Worker packaging, unit/API/mock integration tests and deterministic evaluations. The revised suite has 107 tests, with nine policy-draft cases; browser and source-matched results are retained separately. The prior npm audit result remains applicable to the unchanged dependency lockfile; no package dependency was added.

`npm run verify:policy-ui -- --live --max-http-requests=3` is a separate explicitly gated operator journey. It requires approved enabled local credentials and an explicit NVIDIA model. It owns a loopback-only production backend and a headless browser, caps actual provider HTTP attempts at three, checkpoints reservations/outcomes, and closes both resources. Missing flags/configuration fail before starting the journey. No hosted environment or secret is configured.

The journey clicks consent, retrieves an actual official Tavily source, checks the manual-exception routing, requests the real NVIDIA draft, verifies displayed text and exported live provenance, then checks that unknown context holds and reset clears results. It does not run the final benchmark. Actual results for this revision must be recorded only after execution; failure, unknown usage or refusal must be retained, without retries disguised as a successful first run.

Final weighted independent review, public deployment and monetary-cap verification, the frozen benchmark, then video and submission remain separate gates.
