# Release identities and freeze

This ledger separates observed development artifacts from the final submission. The project has not been submitted by this work.

## Verified snapshot — October 29, 2026, 23:10 UTC

| Artifact | Observed identity |
| --- | --- |
| Latest application source | [GitHub main](https://github.com/Allenllii/marginguard/tree/main); inspect its commit history for later source changes. |
| Reviewed application baseline | [PR #19 merge `70759199ea11395284e952bfc37054f48c19edf1`](https://github.com/Allenllii/marginguard/tree/70759199ea11395284e952bfc37054f48c19edf1), following [PR #18](https://github.com/Allenllii/marginguard/pull/18). All 180 files matched the tested source candidate. |
| Verified public Site | [MarginGuard offline judge demo](https://marginguard-evidence.liwenzhao0306.chatgpt.site), Sites version **5**. Native deployment status was `succeeded`. |
| Sites v5 source commit | `fe1845e33747c3e0d096fd98478dd90d1cbbf270` in the separate Sites source repository. |
| Sites v5 saved artifact | SHA-256 `95b797c038de93a212eb7d1af058b831a3cb6dd860397c7a8effa088b1da4379`, two-file Worker archive. |
| Runtime profile | Forced offline; authored fixtures, no current retrieval or hosted model inference claimed. |
| Application-baseline checks | 209/209 unit/API tests, 65/65 offline harness self-tests, 12/12 synthetic routing cases, 13/13 offline artifact routes, and the same 43/43 browser scenarios on local Node and forced-offline Worker. GitHub Actions had zero runs. These are development regressions; the final benchmark has not run. |
| Footer correction | The source footer points to this main-branch ledger. This correction is newer than the recorded v5 snapshot and requires its own verified deployment before it is described as live. |

GitHub application commits and Sites commits identify different repositories.
Sites also applies its own forced-offline build profile and packaging. The
records above do not establish whole-tree or byte equality between those sources.
Record each later saved version, source commit and deployment result separately.

## Historical baseline before these merges

| Artifact | Observed state |
| --- | --- |
| Public repository | https://github.com/Allenllii/marginguard; MIT. PRs 1-9 contain the tracked source history. PR #11 integrated the complete verified baseline into main at `d9867a0279f35d8990d9402d5b57b99db037583e`; 137 file hashes matched. |
| Previously deployed source | `804e44eaf92186a781002db041d17c68adccd6bd` plus the forced-offline build profile |
| Public judge URL | https://marginguard-evidence.liwenzhao0306.chatgpt.site |
| Site identity | `appgprj_6ae108e911088191834d591d732db251`; public saved version 1 was observed. Deployment owner must record each subsequent saved version and source commit. |
| Pending runtime update | Review fixes add stateless offline references across cold isolates, distinguish ordinary apps from confirmed Scripts API, and correct hosted CSV-processing text. Redeploy the verified integrated source before claiming those fixes are live. |
| Actual sponsor calls | `evidence/pr7-live-journey-20261029.json`: Tavily `8df2a245-7576-48d3-9d40-ffb7b7213991`; NVIDIA `196038cb42e7180cb4fb6c1b30977819`, model `nvidia/Nemotron-3_5-Lightning` |
| Public runtime profile | Forced offline; no hosted provider secrets, live inference or current retrieval is claimed. Raw CSV is sent to the app server for transient calculation. |
| Verification at that baseline | 124/124 unit/API tests, 12/12 synthetic routing cases, 13/13 artifact routes and the same 13/13 browser scenarios on Node and offline Worker. New raw logs remain local pending separate upload approval; `SOURCE-MANIFEST.json` pins the actual public tree. |
| Final source SHA / deployment version / archive hash | PENDING final independent review, corrections and verification; record immutable identities before submission |
| Final benchmark | NOT RUN. Follow the frozen protocol and approval gates in SPEC.md. |
| Final video / submission | PENDING final project/review/benchmark gates and user review; old local drafts remain unchanged and unpublished |

Before submission: verify default main exposes the complete tested source; compare its tree to the manifest; inspect an anonymous judge journey after the latest deployment; preserve real request/usage evidence and failures; record the final code SHA, deployment version, dataset and archive hashes, video URL/version and Devpost submission time. Structural citation checks are not a semantic review.

**Freeze: October 30, 2026 at 17:00:00 UTC (13:00 Toronto).** Do not edit submitted repository, site, video or materials after this deadline, including minor corrections, unless the organizer expressly instructs it. No automatic push/deploy workflow may mutate frozen artifacts. Keep judge access free through December 15, 2026.

Rules reference: https://nebiusglobalaihackathon.devpost.com/rules. The parent coordinates final eligibility and submission approval.

## Judge-entry follow-up

Source branch at that review: https://github.com/Allenllii/marginguard/tree/codex/judge-case-entry, based on review-fix commit `57b71a4effe33a3ee5808afe8c9a9568765185ad`. PR #11 main integration completed at `d9867a0279f35d8990d9402d5b57b99db037583e`; PR #12 records the subsequent one-click entry. The follow-up adds a homepage one-click manual-discount counterexample, explicitly using authored offline source summaries and a rule-based decision; it does not claim a live search or independent model discovery. Deployment synchronization and anonymous smoke must record the new saved version and exact source SHA before this entry is described as live. Final benchmark remains NOT RUN.

## Visual follow-up

Source branch at that visual review: https://github.com/Allenllii/marginguard/tree/codex/evidence-desk, based on PR #12 commit `01ac90f91a84dd097682bcc6949e1399811f4b57`. Dedicated case comparison, evidence boundary, readable policy text and a brief decision reveal are documented in VISUAL-DESIGN.md. Final-source local checks passed 124 unit/API tests, 12 routing cases, 13 artifact routes and the same 15 browser scenarios on Node and offline Worker. The public site needs a source/version synchronization and anonymous smoke before these changes are claimed live. No new provider call, final benchmark or video. GitHub Actions had zero runs at the baseline merge; local passes are not CI passes.

Main also integrated the one-click follow-up through PR #12 at `f5a264e1e05c86e81b1814c2b04bf533d234a975`.

## Interaction QA follow-up

Follow-up source branch: https://github.com/Allenllii/marginguard/tree/codex/interaction-accessibility, based on PR #13 source `18f4fdadf0f1f55fec510860441e8b7e3fa27830`. This fixes explicit case-entry result focus/scroll, stale case navigation, keyboard access to a closed mobile menu, Escape/trigger focus and small assumption/finding/KPI/footer text. It does not change calculations or provider consent. Full current counts are pinned in the source manifest. New raw QA logs stay local. PR #13 was initially approval-blocked, then explicitly authorized and merged to main at `ccfd2bca55a1c9a21455a1a8b879b70e27eaaef0`. This interaction follow-up remains separate. The proposed CI files remain local and are excluded from this follow-up until separately authorized. Final benchmark is NOT RUN.


## Local integrated follow-up, October 30

Public baseline: main `7466e4fa8d63d3226210029cdd6c5abf5b933cf3` (PR #21).
Local follow-up commits preserve static diagnostics, exact reviewed-source scope,
merchant eligibility versus geography, nullable tool metadata, Policy-to-Test
JSON export and fixed-basket A/B comparison. The verified bridge code at
`3cabd0d2bdf478458128287c9ea6fb52338c207c` completed the controlled synthetic
local UI loop. Export integration is `68940cbc38c3b98f626557dc941f6668aa6c5645`;
comparison integration is `a82e5de7cc0e83244d2fa7717968bd2c1cd546fa`.
These identities are local code commits, not a deployment claim. Final combined
verification, remote tree identity and next Sites version must be recorded by
the release owner. The public runtime remains forced offline; final benchmark
and video remain unrun. The original deadline freeze still applies.
