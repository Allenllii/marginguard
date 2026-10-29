# Policy-to-Test integration

Upstream component: `a81ac1d264b044f42b21ed8fb82178f02a87400a`, originally based on main `868ff2e813ff21f33edf713bd46eebae506ca865`. Integrated locally after CSV mapping commit `70e267b279b0ec0b5ac0a6f148c5465866d02f36`. The mounted view adds a pure evidence checker and offline regressions; CSV calculations and provider configuration are unchanged; conservative shared source screening is included in this integration.

Policy-to-Test challenges a proposed investigation against three **synthetic counterfactual scenarios**, using one unchanged research packet: native code/automatic discounts, manual POS/draft discounts, and unknown origin. These cards never execute a store test or transaction. Support means support for investigation, not approval to make a change. A matching manual exception can challenge a settings remedy and instead support an override audit. Unknown always HOLDs.

## Minimal mount

In `src/PolicyResearch.tsx`, import:

```tsx
import PolicyTestLab from './PolicyTestLab';
```

After the existing decision card, inside the packet results:

```tsx
{issue?.kind === 'discount' ? <PolicyTestLab packet={packet} /> : null}
```

The component owns only the proposed-action selector. It has no network call, CSV prop, provider configuration, persistence or financial calculation. Its CSS is imported locally and namespaced. It reuses the existing server-issued packet; it does not add clauses or run a new search to make a comparison look complete. The ordinary existing fixture therefore supports the normal card only; the manual existing fixture challenges the manual settings remedy only. The dedicated UI test uses one explicitly authored fixture containing both clauses, to exercise all three verdicts.

## Pure interface and trust boundary

```ts
buildPolicyTestSuite({
  packet, // existing ResearchPacket, issued by /api/research
  action: 'review-combination-settings', // or 'audit-manual-overrides'
  candidates, // optional untrusted model candidate array; no model call here
});
```

It returns `mode`, `status`, `notice`, `rejectedCandidates` and three ordered cards. Each card contains `scenario`, `verdict`, `reason`, `nextCheck`, exact source-clause `evidence`, and `missingEvidence`.

An optional candidate is strictly:

```json
{
  "sourceId": "S1",
  "ruleId": "manual-exception",
  "quote": "Manual POS and draft-order discounts apply regardless of combination settings.",
  "limitation": "review-only"
}
```

There are at most six candidates; arbitrary verdicts, next steps, prose, URLs, extra fields and other limitations are rejected. Code checks the official platform domain, scheme/credentials/port, source ID uniqueness, packet/region/platform scope, exact complete sentence membership, narrow rule grammar, denials, conflicts and unresolved conditions. A positive candidate cannot hide a contrary sentence or source. Explicit `[]` means no evidence, without fallback. With no candidate argument, code proposes candidate clauses from the same packet and passes them through the same checks. This revision does not alter the existing NVIDIA prompt or claim model discovery.

The matcher deliberately accepts a small declarative grammar, including the existing authored native/manual/WooCommerce fixtures. Questions, reported claims, another subject's exception and unverified additional conditions HOLD. **Live excerpts outside this grammar also HOLD**; this is conservative under-recognition, not a general policy language interpreter. A URL and a matching sentence do not authenticate arbitrary caller-supplied packet contents or establish policy semantics. Do not add an endpoint accepting client-provided source text as live evidence. Keep the existing server-issued research ID/cache and Tavily source-screening boundary.

All supported cards retain missing store eligibility, actual configuration/override records, transaction scope, intent and effective-date checks. Source provenance is inherited from the packet; source snippets remain untrusted. No store account is connected, cause established, or recovery measured.

## Reproduce offline verification

```sh
npm ci --ignore-scripts --registry=https://registry.npmjs.org
node --import tsx --test tests/policy-to-test.test.ts
node --import tsx scripts/verify-policy-to-test-ui.ts
npm run lint
npm run build:frontend
npm test
```

The UI verifier owns a headless Chrome process and temporary loopback Vite server, disables Vite environment-file loading, and permits only same-origin GET requests. It never imports the app server, keys or CSV. It checks keyboard action selection and disclosure, exact citations, unknown HOLD, synthetic/fixture labels, visible focus, 44px controls, 320/768/1440 layouts, reduced motion, page errors and outbound requests. Chrome must be installed; a sandbox may need permission for the browser and test API to connect to their own loopback server.

Integration review added four regressions that first failed: cross-sentence retractions, cross-source retractions, missing/conflicting region metadata and failed live-packet wording. Retractions now conservatively hold the whole packet. Source-region metadata is required; unknown applicability holds. A live-mode label describes the received mode without asserting successful or usable retrieval. This remains a narrow matcher, not semantic certification.

Observed locally after integration: 31 Policy-to-Test unit regressions, all 170 existing-plus-new unit/API tests, 14 isolated component UI checks, three integrated browser scenarios, lint and strict frontend build passed. Browser scenarios cover unchanged exposure/no extra request when changing hypothesis, context invalidation, shipping exclusion, repeated preview, no-result/retracted/wrong-region HOLD, keyboard, 320px layout and reduced motion. The final combined suite is recorded separately in the integration handoff. Local proof files stay local; they are not a sponsor benchmark or real provider-call evidence.

No live provider requests, real merchant CSV transfer, final benchmark, deployment, video or key changes were performed. Live excerpts outside the declared grammar can remain on HOLD; real provider validation of this new view has not been run.

Independent-audit corrections: every sentence in a recorded packet must now be
recognized by the narrow rule catalog, apart from exact review reminders in the
authored fixtures. An unknown follow-up sentence holds the whole packet even if
a candidate selects a positive earlier sentence. Full Tavily result text is
screened for known retractions, expiry and contrary rules before excerpt
selection. Regional restrictions are checked in titles and body text; absence
of a detected restriction no longer produces a `global` tag. These conservative
screens reduce coverage and do not certify arbitrary policy semantics.
Unfamiliar source titles also HOLD, even with a caller-supplied `global` tag.
Only the small declared fixture/document-title catalog is recognized; this
avoids pretending that a country-name keyword list covers every possible scope.
