# Source consolidation, 2026-10-30

The user's requested delivery is one verified public GitHub source followed by a fresh local clone for manual import into Claude Code. It is not a deployment, new evidence release or final contest submission.

The verified starting public main is `d2b9ce76f5288b3ac77d8e436f259ea1bc2de96e`, tree `e53c7376868c626cdbbcef25d1f92bda2e315cde`, 216 tracked files. Existing public commit history is retained; no force push or replacement root commit is required.

The local development work was distributed among a main `margin-guard` workspace, reviewed Git candidates and source exports. Only source, tests, configuration and documentation were compared. Credentials, local environment files, private benchmark material, pending real-request evidence and generated output were excluded from consolidation.

## Code disposition

| Local workstream | Disposition |
| --- | --- |
| Reviewed integration source export | Its 164 allowlisted source/test/doc/config files matched public main after line-ending normalization. |
| Policy-to-Test audit export, local commit `b61d4d3d94418570f691f61793bc35660531a75e` | Core implementation and tests already in public main. Older README/config/manifest variants must not overwrite later work. |
| Sponsor bridge and diagnostics review | Existing source is already represented by public main. Earlier HOLD records and later successful local observations describe different runs; retain their chronology. |
| Policy dossier review, local commit `be2f9f6c4e3d93c0f49a4473d1967aea81d43a2a` | Seven source/test paths imported as one isolated commit onto public main. No evidence directory or private ancestor history was imported. |
| Main-workspace offline CI proposal | Complete source saved as the inactive `docs/ci/verify.yml` template with `docs/CI.md`. Existing OAuth access lacks `workflow` scope; no scope expansion or active workflow publication. No credentials, live calls, deployments or final benchmark commands. |
| Windows fresh-clone regression | `.gitattributes` pins synthetic CSV checkout line endings to LF, preserving the generator's exact byte fingerprint under Windows `core.autocrlf`. |
| Older product/source candidates | Preserve originals locally. Superseded variants do not replace newer policy-scope, HOLD, interruption-safety or browser fixes. |
| Historical archives, screenshots, logs, generated bundles and node_modules | Not required source inputs; remain outside this consolidation. |

The policy dossier change adds `server/preflight-policy-dossier.ts`, `shared/policy-review-dossier.ts` and `tests/preflight-policy-dossier.test.ts`; it updates policy preparation, bridge-response validation, the sponsor UI and bridge browser scenarios. Unknown source versions remain HOLD. It supplies bounded complete paragraph passages, UTF-16 ranges and content fingerprints for human review; it does not certify source authenticity, grant eligibility, call NVIDIA on unreviewed passages or permit confirmation.

Original local commits and files remain in place. A code-only import preserves the useful enhancement without publishing unrelated local evidence history. A fresh clone should use the final verified main commit, not an old source export's manifest or a local candidate's test count.

## Evidence and runtime limits

The hosted version6 is forced-fixture and has no hosted provider credentials. A historical real local Tavily Search → Extract → NVIDIA → explicit confirmation → synthetic `-600 cents` simulation succeeded. That does not prove hosted live operation, real merchant eligibility, checkout changes or realized savings.

Seven later sanitized real-evidence files still await separate user approval. They and their request metadata are excluded. Private benchmark gold is excluded. Public historical evidence already in the repository remains public history; that does not authorize new private evidence.

Final benchmark is NOT RUN. Devpost remains a draft, not a submitted entry. This source consolidation does not publish a video, change the hosted Site, buy service or configure credentials. Review actual test and Actions receipts for their exact commit rather than treating historical counts as new results.

## Fresh local validation

On 2026-10-30, product source commit `8f8f9403d9e901e0ba0c163a3aba224d1130f2bf` passed `npm run check`: lint, strict types/builds, 323 unit/API tests, 65 benchmark-framework tests, exact 504-order synthetic arithmetic/row evidence and 12/12 synthetic policy-routing cases. `npm run build:offline-demo` passed 13 forced-offline route checks with zero outbound attempts. The standard built Node runtime on loopback port 4311 and the standard built Worker served through a local HTTP QA adapter on port 4312 each passed all 76 browser scenarios. Live flags remained false; this is local verification, not hosted integration proof, a final benchmark or GitHub Actions execution.

The first sandboxed run could not connect to its own loopback API test servers (321/323); rerunning with local test access passed all 323. A separate generator equality failure revealed Windows CRLF checkout conversion. The LF attribute correction was verified in a fresh independent Windows checkout, and the full check then passed. No fixture values were changed to obtain a pass. Subsequent additions are the CI template and handoff documentation.
