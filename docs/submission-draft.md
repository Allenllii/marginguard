# MarginGuard submission facts - draft, not submitted

Target: Best Use of Tavily, with Apps and Agents as an optional track. The official rubric weights technical implementation, design, potential impact and idea quality equally. This document records current facts; final presentation and video remain paused until implementation, independent review, fixes and the final benchmark gates are complete.

## Product description

MarginGuard helps a small ecommerce seller turn an order CSV into an auditable margin watchlist and a specific next check. Integer-cent calculations identify discount, shipping and return exposures; source rows, formulas and editable seller assumptions remain visible. A reproducible 504-order synthetic store has three planted issues. Its $1,918.58 modeled exposure is not realized recovery or measured customer impact.

The primary policy workflow challenges a generic discount-settings remedy. The seller supplies the discount origin and operating context. Tavily retrieves official documentation; a conservative rule checks its applicability. A documented manual/POS/draft-order or confirmed Scripts API exception can redirect the next check to the originating override or Scripts API path. An ordinary app does not inherit the Scripts API exception. Unknown origin, wrong region and insufficient or conflicting evidence hold the recommendation.

NVIDIA on Nebius drafts a source-linked investigation rationale, next step and uncertainty using aggregate findings and supporting passages. Code supplies the limited policy-scope sentences and retains authority over status and money. Invalid references, unsupported bounded claims and observed incomplete prose fail visibly to fixture guidance. Neither a citation ID nor the model establishes causation or full semantic fidelity.

## Actual technology use and feedback

- Tavily Search API: fixed generic official-domain queries, basic search, up to three sources, no generated answer, returned request/credit evidence. Raw orders and product labels never enter the query.
- Nebius Token Factory: authenticated model discovery and OpenAI-compatible completion from `nvidia/Nemotron-3_5-Lightning`. No alternative vendor/model is silently substituted. The adapters and validation are separate from domain arithmetic.
- The October 29 local browser probe recorded three HTTP requests, one Tavily credit, and one accepted NVIDIA completion: 579 input / 99 output tokens. See `evidence/pr7-live-journey-20261029.json` and `PR7-LIVE-VERIFICATION.md` for exact request IDs, source revision, observed latency and limitations.
- Real integration exposed JSON budget/truncation and prose-quality failures. Application guards and a smaller structured draft contract addressed those observed cases. Later successes do not erase earlier failures or establish generalized quality. No final comparative benchmark has run.
- Provider IDs, returned usage and actual latency are retained separately from price estimates and unconfirmed invoice charges. No actual account monetary hard cap has been assumed verified.

## Public judge access and reproduction

Public offline demo: https://marginguard-evidence.liwenzhao0306.chatgpt.site

Public source: https://github.com/Allenllii/marginguard (MIT). Exact integration/deployment identities and remaining synchronization are in `RELEASE.md`. The public site contains synthetic data and labeled authored summaries; it calls neither provider. Actual sponsor proof is a separate local observation. Judges need no account or credits to use the offline demo.

README contains setup, production and regression commands. `SOURCE-MANIFEST.json` pins shipped files, and `data/ground-truth.json` pins arithmetic/evidence rows. CSVs are sent to the app server for calculation and are not persisted by the app; use synthetic or non-sensitive data on the public site. No live merchant integration or production customer validation is claimed.

## Remaining gates

1. Verify integrated default-branch source and updated public deployment against exact identities; smoke the anonymous desktop/mobile path.
2. Complete fresh independent whole-project review, fixes and regression/re-review. Scores require evidence and are not award probabilities.
3. Freeze the final candidate, inputs and protocol; authorize and run the final benchmark only after the prior gates. Keep complete failures and reviewer limitations.
4. Then produce the under-three-minute video and final English submission, obtain final user review and submit before the deadline. No new video or submission was made during the review-fix work.

Freeze submitted artifacts at **October 30, 2026, 17:00 UTC**; preserve free judge access through December 15. Record final source SHA, deployment version, archive/data hashes, video URL/version and submission time. The public offline demo is not evidence of public live inference.

Official rules: https://nebiusglobalaihackathon.devpost.com/rules
