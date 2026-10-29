# Release identities and freeze

This ledger separates observed development artifacts from the final submission. The project has not been submitted by this work.

| Artifact | Observed state |
| --- | --- |
| Public repository | https://github.com/Allenllii/marginguard; MIT. PRs 1-9 contain the tracked source history. PR #11 integrated the complete verified baseline into main at `d9867a0279f35d8990d9402d5b57b99db037583e`; 137 file hashes matched. |
| Previously deployed source | `804e44eaf92186a781002db041d17c68adccd6bd` plus the forced-offline build profile |
| Public judge URL | https://marginguard-evidence.liwenzhao0306.chatgpt.site |
| Site identity | `appgprj_6ae108e911088191834d591d732db251`; public saved version 1 was observed. Deployment owner must record each subsequent saved version and source commit. |
| Pending runtime update | Review fixes add stateless offline references across cold isolates, distinguish ordinary apps from confirmed Scripts API, and correct hosted CSV-processing text. Redeploy the verified integrated source before claiming those fixes are live. |
| Actual sponsor calls | `evidence/pr7-live-journey-20261029.json`: Tavily `8df2a245-7576-48d3-9d40-ffb7b7213991`; NVIDIA `196038cb42e7180cb4fb6c1b30977819`, model `nvidia/Nemotron-3_5-Lightning` |
| Public runtime profile | Forced offline; no hosted provider secrets, live inference or current retrieval is claimed. Raw CSV is sent to the app server for transient calculation. |
| Current local verification | 124/124 unit/API tests, 12/12 synthetic routing cases, 13/13 artifact routes and the same 13/13 browser scenarios on Node and offline Worker. New raw logs remain local pending separate upload approval; `SOURCE-MANIFEST.json` pins the actual public tree. |
| Final source SHA / deployment version / archive hash | PENDING final independent review, corrections and verification; record immutable identities before submission |
| Final benchmark | NOT RUN. Follow the frozen protocol and approval gates in SPEC.md. |
| Final video / submission | PENDING final project/review/benchmark gates and user review; old local drafts remain unchanged and unpublished |

Before submission: verify default main exposes the complete tested source; compare its tree to the manifest; inspect an anonymous judge journey after the latest deployment; preserve real request/usage evidence and failures; record the final code SHA, deployment version, dataset and archive hashes, video URL/version and Devpost submission time. Structural citation checks are not a semantic review.

**Freeze: October 30, 2026 at 17:00:00 UTC (13:00 Toronto).** Do not edit submitted repository, site, video or materials after this deadline, including minor corrections, unless the organizer expressly instructs it. No automatic push/deploy workflow may mutate frozen artifacts. Keep judge access free through December 15, 2026.

Rules reference: https://nebiusglobalaihackathon.devpost.com/rules. The parent coordinates final eligibility and submission approval.

## Judge-entry follow-up

Current complete source branch: https://github.com/Allenllii/marginguard/tree/codex/judge-case-entry, based on review-fix commit `57b71a4effe33a3ee5808afe8c9a9568765185ad`. PR #11 main integration completed at `d9867a0279f35d8990d9402d5b57b99db037583e`; PR #12 records the subsequent one-click entry. The follow-up adds a homepage one-click manual-discount counterexample, explicitly using authored offline source summaries and a rule-based decision; it does not claim a live search or independent model discovery. Deployment synchronization and anonymous smoke must record the new saved version and exact source SHA before this entry is described as live. Final benchmark remains NOT RUN.

## Visual follow-up

Current complete visual source branch: https://github.com/Allenllii/marginguard/tree/codex/evidence-desk, based on PR #12 commit `01ac90f91a84dd097682bcc6949e1399811f4b57`. Dedicated case comparison, evidence boundary, readable policy text and a brief decision reveal are documented in VISUAL-DESIGN.md. Final-source local checks passed 124 unit/API tests, 12 routing cases, 13 artifact routes and the same 15 browser scenarios on Node and offline Worker. The public site needs a source/version synchronization and anonymous smoke before these changes are claimed live. No new provider call, final benchmark or video. GitHub Actions had zero runs at the baseline merge; local passes are not CI passes.

Main also integrated the one-click follow-up through PR #12 at `f5a264e1e05c86e81b1814c2b04bf533d234a975`.

## Interaction QA follow-up

Follow-up source branch: https://github.com/Allenllii/marginguard/tree/codex/interaction-accessibility, based on PR #13 source `18f4fdadf0f1f55fec510860441e8b7e3fa27830`. This fixes explicit case-entry result focus/scroll, stale case navigation, keyboard access to a closed mobile menu, Escape/trigger focus and small assumption/finding/KPI/footer text. It does not change calculations or provider consent. Full current counts are pinned in the source manifest. New raw QA logs stay local. PR #13 was initially approval-blocked, then explicitly authorized and merged to main at `ccfd2bca55a1c9a21455a1a8b879b70e27eaaef0`. This interaction follow-up remains separate. The proposed CI files remain local and are excluded from this follow-up until separately authorized. Final benchmark is NOT RUN.
