# Same-cart promotion comparison

The Promo Preflight page now includes **Compare the same cart** below the collision sandbox. It evaluates the original rules and the seller's explicitly edited rules on one fixed basket. It does not compare two independently chosen worst cases.

## Workflow

1. Enter the basket prices, unit costs, maximum quantities, original rules, shipping assumptions, fee rate, floor and evidence in the existing form.
2. Choose each comparison quantity (zero through the supplied maximum, with at least one item) and **Lock current basket and costs**.
3. B starts as an exact copy of A. Edit, remove or add a supported rule. Record an adjustment reference and explicitly review B.
4. Run **Compare original and adjusted rules**. Inspect each side's rule eligibility, discount stages, fee base, ledger, assumptions, references and B minus A.
5. Download the comparison JSON to replay the exact inputs. No comparison input is sent to a server or provider.

Changing any comparison input clears both amounts, their difference, the downloadable result and the seller review. Changing the source basket, costs, rules, evidence or semantics destroys the entire comparison lock. Reverting a field does not restore an old result. Running again is required.

## Calculation contract

`runPreflightComparison(unknown)` in `shared/preflight-comparison.ts` accepts a single `input`, a `quantities` array in SKU order, `adjustedRules`, `adjustmentReference` and `sellerConfirmed`. It rejects per-side basket or cost overrides and unknown fields.

Both sides reuse the existing validated integer engine. They execute every supplied rule exactly once in its stated order. There is no rule-subset or basket search. The three supported rule types are percentage experiment stages, fixed merchandise discounts and free shipping. The validation bounds remain 1–3 SKUs, quantities 0–3 within the supplied maximum, and 0–3 rules per side.

- USD integer cents; each percentage stage and payment fee rounds half up using BigInt arithmetic.
- Product/order labels are simulation stages; both apply to remaining basket merchandise. Per-unit and per-line rounding are excluded.
- Thresholds use original merchandise subtotal and original item count, including the exact threshold value.
- Fixed discounts are capped at remaining merchandise. Free shipping removes the customer charge while shipping cost remains.
- Payment fee = half-up((discounted merchandise + shipping collected) × basis points / 10000). Fixed payment fees are excluded.
- Contribution = merchandise after discount + shipping collected − COGS − shipping cost − payment fee.
- Difference = adjusted contribution − original contribution, conditional on the same locked cart and cost assumptions.

Invalid and unsupported structures produce no comparison and an accessible HOLD error. Missing references, unknown simulation semantics, fixture mode or absent seller confirmation preserve HOLD even when conditional arithmetic can be shown. Otherwise, either side below the same supplied floor produces REVIEW; both within the floor produce MODEL_CLEAR. These labels apply only to this bounded model. They do not verify checkout behavior or approve launch.

References are plain-text seller attestations. They are not fetched, independently verified or converted into policy citations. Taxes, returns, demand response, duties, overhead, marketing, fulfillment tiers and other fees are excluded. The difference is never described as actual savings or guaranteed sales.

## Synthetic reproduction

Use the default one-item fixture: price 5000 cents, COGS 3000, shipping collected and cost 800, fee 0. A applies PRODUCT20 → ORDER20 → FREESHIP. Lock the basket and remove B's second rule. Supply a synthetic adjustment reference and review B.

| Output | Original A | Adjusted B |
|---|---:|---:|
| Merchandise subtotal | 5000 | 5000 |
| Merchandise after rules | 3200 | 4000 |
| Shipping collected | 0 | 0 |
| COGS | 3000 | 3000 |
| Shipping cost | 800 | 800 |
| Payment fee | 0 | 0 |
| Contribution | −600 | 200 |

The conditional B−A difference is +800 cents. Fixture status stays HOLD.

## Integration and validation

New implementation lives in `shared/preflight-comparison.ts`, `src/PreflightComparison.tsx` and `src/preflight-comparison.css`. Necessary existing-file changes are deliberately small:

- `shared/preflight.ts`: export the existing single-scenario function as `calculatePreflightScenario`; its arithmetic is unchanged.
- `src/PromoPreflight.tsx`: one import and one component mount keyed by the existing `draftVersion`.
- `playwright.config.ts`: register the new browser spec.

The sponsor bridge component, API handlers and provider configuration are unchanged. Source bridge confirmation already increments `draftVersion`, so it also invalidates a prior comparison.

Run the official checks with `npm run check`. For browser regression, start a separate terminal with `PORT=3013 npm run start:qa`, then set `MARGINGUARD_TEST_URL=http://127.0.0.1:3013` and run:

```text
npx playwright test tests/preflight-comparison.browser.spec.ts tests/preflight.browser.spec.ts tests/preflight-bridge.browser.spec.ts
```

On PowerShell, set those environment variables with `$env:PORT='3013'` and `$env:MARGINGUARD_TEST_URL='http://127.0.0.1:3013'`. `start:qa` uses the offline QA profile and does not load environment files. Windows Git CRLF conversion can cause the existing byte-for-byte CSV evaluation to fail; preserve LF bytes in `data/northstar-demo.csv` for that evaluation. No fixture content or application logic needs to change.

The new unit tests were written before the comparison module. They cover shared snapshots, selected quantities, rule order, rounding, fee bases, thresholds, free shipping, negative contributions, zero differences, missing assumptions, malformed and unsupported rules, strict arrays and detached snapshots. Browser tests cover export, immediate invalidation including reverted edits, seller confirmation, HOLD/REVIEW/MODEL_CLEAR, no comparison network requests, keyboard use, zoom and narrow layouts. Screenshots and an executable-input JSON example accompany the local handoff.
