# Submission release and freeze

The final release must be reviewed before submission. No automatic post-deadline pushes, deploys, or edits to submitted materials are authorized.

**Freeze: October 30, 2026, 17:00:00 UTC (13:00 Toronto).** The organizer's checklist explicitly disallows even minor repository, video, and submission-material changes after this deadline. Preserve the submitted state; any later judge clarification must follow organizer instructions.

| Submitted artifact | Exact final identity |
| --- | --- |
| Public GitHub URL | `https://github.com/Allenllii/marginguard`; created public MIT; final source upload/commit verification remains pending |
| Submitted source commit SHA | Pending final tests, public push and read-only verification |
| Source archive SHA-256 | Pending final packaging |
| Native Sites project | `appgprj_6ae108e911088191834d591d732db251` |
| Saved Site version / deployed commit | Pending final source push and successful publication |
| Public demo URL | Expected `https://marginguard-evidence.liwenzhao0306.chatgpt.site`; not yet publication evidence |
| Video URL and immutable version/hash | Pending user review; no public upload authorized |
| Devpost submission version / time | Pending user review and submission approval |
| Actual Tavily runtime evidence | Observed local Tavily request `75fc38ff-9fd0-4b4a-ae88-26ffc1aa57e5`; `evidence/tavily-live-proof.json`, 2026-10-27 20:40:24 UTC; hosted key use not approved |
| Actual Tavily UI evidence | Browser request `1952d500-3070-4422-92ea-ea1a82bbafcd`; `evidence/tavily-ui-live-proof.json`, 2026-10-27 20:53:41 UTC; no NVIDIA call |
| Actual NVIDIA-on-Nebius evidence | Pending approved account/key access and successful runtime call |
| Last complete verification | Latest local commands/counts: `evidence/readiness-20261029.md`; final release still requires public/live verification |

Before submitting: inspect the exact public commit tree; verify no secret files or real orders; run final lint/typecheck/build/unit/API/worker/browser checks and synthetic evaluations; inspect the public demo unauthenticated; verify the actual provider request evidence; record the exact video and deployed version; review every English claim against observed evidence. Judge access must remain free through December 15.

Disable any publish-on-push workflow after the release is frozen. CI may inspect the frozen commit; it must not rewrite artifacts or deploy a different version. Keep completed release IDs and checks in the submission record without rewriting the submitted source after the freeze.
