# Policy watch

A panel (`src/PolicyWatch.tsx`, mounted by the lead in Data & method) that shows whether the official pages MarginGuard's decisions cite still say what we reviewed.

## What is watched

| Page | Used by | Fingerprint |
|---|---|---|
| Shopify · Combining discounts (manual context) | Manual / POS / draft-order discount decisions | `94c0952b…` operative sentences |
| Shopify · Discount combinations on POS | Manual POS discount decisions | `2540e52d…` operative sentences |
| Shopify · Combining discounts (native context) | Automatic discount + code decisions | `69e663eb…` operative sentences |
| Shopify · Combining discounts (Promo Preflight) | Promo Preflight REFERENCE_READY vs HOLD | `21d59687…` exact page bytes, text format |
| USPS · Mail & Shipping Services | USPS shipping-overrun evidence | not fingerprinted |

The first three come straight from `REVIEWED_OPERATIVE_SENTENCES` in `server/tavily.ts`. The live check covers those three. The Promo Preflight fingerprint hashes the whole page in Tavily's `text` format, and a single markdown batch cannot recompute it, so the panel lists it as "Not checked"; Promo Preflight re-checks those bytes itself on every live run and holds when they differ. USPS has no reviewed fingerprint, so there is nothing to compare.

## How a check works

`POST /api/policy-watch/check {"live": true}` (the UI sends it only after the consent box is ticked):

1. Budget is reserved for one Tavily call before anything is sent (429/503 on denial; nothing is dispatched).
2. One Tavily Extract call fetches every watched URL (`extract_depth: basic`, `format: markdown`, 15 s timeout, 500 KB body cap, no retry). Only the requested URLs are accepted, and a body that echoes the key is dropped.
3. Each page is re-hashed exactly as decisions do: `operativeHash(operativeSentences(page, title, 'discount', context))`. Equal to the reviewed hash → `unchanged`; different → `changed`, with a bounded plain-text summary (sentences added/removed, first difference) and a re-review flag, matching `policyChanged` in `research()`; page missing → `unavailable`.

`GET /api/policy-watch` returns the page list and the recorded live check from `evidence/policy-watch-20261030.json`, labelled "Recorded live check (request 651f7607…, 2026-10-30)". It is never presented as current. Hosted and offline builds always serve this replay.

## Recorded check (2026-10-30)

One Extract call, request `651f7607-3002-4c6b-bf5e-d12e4f52d6b4`, 194 ms, 0 credits reported (basic Extract bills 1 credit per 5 URLs; worst case 1). All three operative-sentence fingerprints were unchanged. The evidence file stores the request body, SHA-256 of the response and page bodies, and the exact `lastCheck`; no key, header or page text.

Tests: `tests/policy-watch.test.ts`. There is no Playwright spec, because `playwright.config.ts` lists its specs explicitly and the panel is not mounted yet; the component is rendered server-side in the unit test instead.
