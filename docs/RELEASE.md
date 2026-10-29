# Release identities and freeze

This ledger separates observed development artifacts from the final submission. The project has not been submitted by this work.

| Artifact | Observed state |
| --- | --- |
| Public repository | https://github.com/Allenllii/marginguard; MIT. PRs 1-9 contain the tracked source history. Default-branch integration is being verified in the review-fix phase. |
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

Current complete source branch: https://github.com/Allenllii/marginguard/tree/codex/judge-case-entry, based on review-fix commit `57b71a4effe33a3ee5808afe8c9a9568765185ad`. PR #11 main integration remains approval-blocked. The follow-up adds a homepage one-click manual-discount counterexample, explicitly using authored offline source summaries and a rule-based decision; it does not claim a live search or independent model discovery. Deployment synchronization and anonymous smoke must record the new saved version and exact source SHA before this entry is described as live. Final benchmark remains NOT RUN.
