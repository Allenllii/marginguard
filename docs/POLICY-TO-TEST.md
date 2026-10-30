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

The component owns only the proposed-action selector. It has no network call, CSV prop, provider configuration, persistence or financial calculation. Its CSS is imported locally and namespaced. It reuses the existing server-issued packet; it does not add clauses or run a new search to make a comparison look complete. Because every card is decided by `decidePolicy`, the panel can never disagree with the main decision card on the same packet. The dedicated UI test uses one authored fixture containing both a native and a manual clause, to exercise all three verdicts.

## Pure interface and how verdicts are decided

```ts
buildPolicyTestSuite({
  packet, // existing ResearchPacket, issued by /api/research
  action: 'review-combination-settings', // or 'audit-manual-overrides'
});
```

It returns `mode`, `status`, `notice`, `rejectedCandidates` (always `0`; kept for the v1 audit schema and the current UI) and three ordered cards. Each card contains `scenario`, `verdict`, `reason`, `nextCheck`, `evidence` and `missingEvidence`.

**One authority.** For each card the suite calls `decidePolicy('discount', packet)` with the packet's own context and only `discountOrigin` swapped: `native` for "Normal / code", `manual` for "Manual / POS / draft", `unknown` for "Unknown". It then maps the decision:

| Card | decidePolicy says | Review combination settings | Audit manual overrides |
|---|---|---|---|
| Normal / code | `review` | supported | HOLD |
| Manual / POS / draft | `contradicted` (manual exception) | contradicted | supported |
| Unknown | always `hold` | HOLD | HOLD |
| any | `hold` / `insufficient` | HOLD | HOLD |

Native + manual audit is HOLD, not contradicted: a code or automatic discount has no manual override to audit, and the cited policy points at the settings instead. No policy exception argues against the audit, so the "Exception challenges remedy" label would be wrong.

Card evidence lists exactly the sources `decidePolicy` cited (`sourceIds`). The quote is the full sentence from that source's snippet that best matches the scenario (a manual/POS/draft sentence with "always apply", "bypass" or "regardless" for the manual card; a combination sentence that doesn't mention manual/POS/draft for the native card). Quote selection never changes a verdict.

**Pre-screens that HOLD every card.** Before calling `decidePolicy`, the suite rejects packets that are not an `ok` US discount packet with 1-3 sources (`S1`-`S3`, snippets up to 1,200 characters), duplicate source IDs, a source URL that isn't HTTPS on the platform's official domain (`help.shopify.com` or `woocommerce.com`, no credentials or port), prompt-injection text or markup in a title or snippet, a retraction, expiry or contrary rule, and a UK or other non-US source region. A source with no region tag is allowed, as in `decidePolicy`; Tavily only tags `global` when a page says so.

What this does not do: it doesn't read the full policy page, check store eligibility, confirm the effective date, or run anything against a store. Snippets remain untrusted text. Do not add an endpoint accepting client-provided source text as live evidence; keep the server-issued research ID/cache and Tavily source screening.

### October 29 change: one decision rule for both panels

A live Tavily run returned the Shopify POS page ("Custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions. ..."). The main decision card (`decidePolicy`) rebutted the settings fix, while Policy-to-Test held all three cards, because its separate exact-sentence matcher and closed title list only recognised authored fixture wording. The matcher, the title list and the unused model-candidate filter (`PolicyTestCandidatesSchema`, no caller in `src/`, `server/` or `shared/`) were removed. `tests/policy-to-test.test.ts` now pins agreement with `decidePolicy` on that real packet and on the offline fixtures. The audit `rulesetVersion` moved to `policy-to-test/v2`.

Precision now equals `decidePolicy`'s. Its manual check works per source rather than per sentence, and its native check accepts any passage that mentions combinations, so some phrasing the old matcher held (questions, conditional clauses, a manual subject borrowed from another sentence) now follows the main card.

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

Observed locally after integration: 31 Policy-to-Test unit regressions, all 170 existing-plus-new unit/API tests, 14 isolated component UI checks, three integrated browser scenarios, lint and strict frontend build passed. Browser scenarios cover unchanged exposure/no extra request when changing hypothesis, context invalidation, shipping exclusion, repeated preview, no-result/retracted/wrong-region HOLD, keyboard, 320px layout and reduced motion. The final combined suite is recorded separately in the integration handoff. Local proof files stay local; they are not a sponsor benchmark or real provider-call evidence.

No live provider requests, real merchant CSV transfer, final benchmark, deployment, video or key changes were performed. Those counts predate the October 29 change.
