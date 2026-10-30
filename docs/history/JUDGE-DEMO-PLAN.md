# Judge-accessible demo without hosted provider keys

Status: a locally verified deployment candidate and release procedure, **not a deployed website**. No native Site publication, access change or runtime-secret operation was performed in this phase.

## Selected project and current state

Reuse registered Site `appgprj_6ae108e911088191834d591d732db251`; do not create another project. A read-only native `get_site` on October 29 returned an active project, owner role, custom access, version zero and no current live or expected URL. The previously recorded candidate hostname is not a verified judge URL. Public accessibility requires the separately approved native access/deployment operations and a successful returned literal URL.

## Forced-offline build

```text
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run check
npm run build:offline-demo
```

The last command builds the canonical frontend and standard Worker, then selects `worker/offline-entry.ts` for the separate judge profile. It emits the same official Worker ESM layout in both `offline-dist/` and the final native-package input `dist/`:

```text
server/index.js
.openai/hosting.json
```

All HTML/JS/CSS assets are embedded in the Worker. The generated offline manifest preserves the exact Site identity and declares no D1 or R2 binding. The tracked standard source manifest and independent `frontend-dist/` remain intact. `npm run build` restores the standard generated profile; after any such build rerun `build:offline-demo` before packaging the offline candidate.

The offline entry discards the hosting environment entirely. Runtime provider keys, enable flags, hard-cap flags and database bindings cannot enable outbound calls. Only a fixed disabled-provider environment reaches the shared service. CSV data and fixture policy packets remain transient in request/isolate memory; no customer data is saved to storage. Live-query attempts return a truthful unavailable state with no invented source proof. Fixture preview, deterministic import/math, evidence rows, scenarios and exports remain usable.

`verify-offline-artifact.mjs` checks the exact two-file allowlist, Site identity, no storage requirement, standard/offline artifact equality, HTML/asset MIME, health, synthetic totals, template/import, source fixtures and malformed/cross-origin requests. A runtime proxy throws if any hosting setting is read; outbound fetch attempts are counted and forbidden. Local browser checks exercise the same built Worker through a loopback HTTP bridge. These checks do not emulate native hosting access controls or guarantee uptime.

## Approved release procedure, not executed here

1. Review the exact public-source commit and select the forced-offline profile. Keep the open draft PR stack distinct from a final submitted release; the current full source is on its explicit branch/commit, while the default branch has not been updated by this task.
2. In the Sites-capable environment, open the **existing** project's source repository using the supported source helper and a fresh native credential under the applicable approval. No credential was requested or configured by this preparation phase. Do not opt into publication on push while publication remains out of scope.
3. Push the reviewed source, run only remaining checks and `build:offline-demo` through the helper, and package its unchanged archive. The final package must contain the forced-offline `dist` profile, not a later standard rebuild. Verify the saved version's generated no-storage manifest; native provisioning acceptance is still untested. The native source commit and public GitHub commit may differ in deployment metadata and must both be recorded.
4. After publication/access authorization, save the archive-backed version and select the intended public audience with native tools. Current custom access is not sufficient evidence of anonymous judge access. Deploy only that saved version, preserve its IDs, and wait for the terminal native result.
5. Use the returned URL literally. Verify it without authentication: homepage, JS/CSS MIME, `/api/health` showing both providers in fixture mode and `liveSafe:false`, valid/invalid import, policy exception/unknown-context hold, scenario navigation, export and reset. Record native version/source commit, artifact hash and actual smoke evidence. No provider secret, D1 migration or paid upstream call is needed for this profile.
6. Preserve free judge access through December 15. Record the submitted commit, saved version, URL and eventual video identity in the release checklist; freeze submitted materials at October 30, 2026, 17:00 UTC. Native availability, audience and actual successful publication remain required release checks.

## Honest competition positioning

Judges can explore calculations, assumptions and authored source fixtures on this offline profile. Its buttons and exported provenance must continue to label fixtures. Genuine local Tavily/NVIDIA request evidence is separate and must identify the exact source/version observed. An offline hosted demo is not a claim that judges are making live sponsor calls, nor does it independently establish final eligibility or award competitiveness. Current provider monetary-cap gates remain unresolved for any future public live profile. Final independent review/fixes and the frozen benchmark still precede video and final submission.
