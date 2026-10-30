# Evidence, decision and draft authority

This phase addresses the observed agreement error in PR #6's live draft and separates the roles of evidence, applicability routing and model synthesis in the interface. It does not add another workflow or change anomaly calculations.

## Regression before implementation

Three account-phrasing cases were added before the fix. The policy-draft suite then had thirteen tests: eleven passed, while the observed-mismatch rejection and no-repair fallback cases failed. Correct singular/plural examples already passed. A new browser scenario also failed on the previous UI while ten existing scenarios passed. The red records are retained separately from final verification.

The adapter now requests neutral merchant wording and checks agreement. The pure policy-draft validator rejects the observed singular-determiner/plural-account mismatch and its direct counterpart. It returns complete offline checks without a live proof or repair call. It does not silently edit the model's words and is not a comprehensive grammar checker. Safe response diagnostics identify this rejection using a fixed classification without retaining raw provider prose or errors.

## Presentation contracts

- `PolicyResearch` owns context, consent, asynchronous lifecycle and transport orchestration.
- `PolicyDecisionCard` renders the rule-based next check before source previews: exact CSV fact, seller assumption, cited policy constraint, next check and disconfirming evidence.
- `PolicyDraftCard` renders limited policy scope separately from an unverified model hypothesis or offline rule-based rationale. A draft cannot approve a remedy or estimate recovery.
- The first relevant source stays open. When no source supports a decision yet, the first source remains inspectable while the decision holds. Additional sources can be expanded.
- The exported policy report states decision and draft authority as well as source/provider provenance.

The deterministic routing, cent arithmetic, consent, stale-response invalidation and live request caps are unchanged. Renderer components accept typed values and perform no requests or domain calculations.

## Verification scope

The updated offline suite has 112 unit/API/mock integration tests, eleven browser scenarios and twelve synthetic policy-routing cases. Actual completed results are in the phase check logs. The revised prompt and grammar guard have not been retested with a new sponsor request in this phase; the PR #6 live proof remains a historical observation of its exact source. No new live usage, public hosting, hosted secret configuration or final benchmark is claimed.

Read-only provider-cost research is documented separately in `PROVIDER-COST-CONTROLS.md`. Public live access remains closed until monetary-cap and deployment gates are resolved. Independent whole-project review and the frozen benchmark still precede video and submission.
