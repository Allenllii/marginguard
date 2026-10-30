# Check any fix

A seller, or the seller's AI assistant, types a proposed margin fix. MarginGuard turns it into the policy claim the fix depends on, reads the official policy for that claim, and returns `supported`, `contradicted`, `insufficient` or `hold` with quotes that code has verified verbatim against the retrieved page. This generalizes the single Shopify POS exception in the main flow to any discount, shipping or returns fix.

Code: `server/check-fix.ts` (pipeline, verification, replay), `server/check-fix-recorded.ts` (recorded runs), `shared/check-fix.ts` (contract), routes in `server/service.ts`, tests in `tests/check-fix.test.ts`, evidence in `evidence/check-fix-eval-20261030.json`.

## Pipeline

1. **Local screen** (no provider call). Region other than US holds. The fix must be 10 to 240 characters and pass the same privacy screen as Promo Preflight (`screenCampaignText`): no emails, URLs, digit runs of five or more, markup, control characters or injection phrases.
2. **Plan** with the fast model (`NEBIUS_MODEL`, default `nvidia/Nemotron-3_5-Lightning`), strict `json_schema`: `{claim, topic, query}`. Code chooses the one official domain: discounts and returns go to the platform (`help.shopify.com` or `woocommerce.com`), shipping goes to the carrier (`usps.com` or `ups.com`), `other` holds. The query passes the same privacy screen and may contain at most four digits.
3. **Tavily Search** (advanced, `chunks_per_source: 3`, `max_results: 3`, `include_domains` restricted to that domain, no generated answer), then one **Tavily Extract** call for the top two screened pages. Screening reuses the main path's rules: https on the chosen domain, Tavily score of at least 0.25, injection text, retraction or contrary wording (`unresolvedPolicyStatement`), non-US region (`inferredSourceRegion`), duplicate pages. Each source passage holds up to four complete sentences (at most 1200 characters) ranked by word overlap with the fix, claim and query, with one extra point for limiting wording such as "regardless", "always apply", "except" or "replaced". Near-duplicate sentences are skipped. The full extracted sentence text stays in memory for verification.
4. **Judge** with the reasoning model (`NEBIUS_REASONING_MODEL`, default `nvidia/nemotron-3-super-120b-a12b`), strict `json_schema` with `sourceId` restricted to the retrieved IDs: `{verdict, quotes[1..3], explanation, nextCheck}`.
5. **Code verification** decides the result:
   - a quote is kept only if, after normalizing whitespace, NFKC forms, typographic quotes and dashes, it is a substring of the cited source's passage, extracted sentences or search content; it is 20 to 400 characters; and it is not a substring of the claim or fix;
   - `supports` and `contradicts` need at least one kept quote, otherwise the status is `insufficient` and code replaces the explanation;
   - explanation and next check are rejected for digits, `$`, `%`, links, markup or causal wording (`UNSUPPORTED_CLAIM`, shared with `validatePolicyDraft`);
   - any schema, transport or prose failure is `hold` with a reason code such as `[JUDGE_SCHEMA_INVALID]`.
6. **Budget and safety.** All five attempts (`tavily ×2`, `nebius ×3`: model list, plan, judge) are reserved in one `reserve` call before the first request, and the transport refuses anything beyond that reservation or outside the four provider endpoints. One request per provider is in flight, with the same 10-second cooldown and Retry-After handling as the other live routes. Response bodies are bounded, every call has a timeout, nothing is retried, and the code holds before any request if either model ID is not an NVIDIA model. Requests go through the injected `request`, so `worker/edge-fetch.ts` applies on Cloudflare.

The three Nebius attempts exceed the default `LIVE_MINUTE_LIMIT` of 2, so the route returns 429 under that default. Local live runs need `LIVE_MINUTE_LIMIT` of at least 3; `wrangler.toml` sets 4.

## Contract

```
POST /api/check-fix  {fix: string, context: {platform: 'Shopify'|'WooCommerce', carrier: 'USPS'|'UPS', region: 'US'|'UK'|'unknown'}, live: boolean}
-> 200 CheckFixResponse (shared/check-fix.ts)
-> 429/503 {error} for budget, cooldown or hosted-without-durable-budget (same as the other live routes)
-> 422 {error} for a malformed body (unknown context values, extra fields)
GET /api/check-fix/examples -> [{id, fix, context}]
```

`mode` is `live` for a request this server made, `recorded` for a replay, `offline` when no provider was called. `quotes` holds only verified quotes. `proof` appears only on live responses. `holdReason` starts with a bracketed code.

Without live keys (offline build, hosted demo), a fix that matches an example's text and context exactly replays its recorded live run after the same quote and prose checks, labelled `Recorded live run (requests 24d5f33b… and bc85bcb7…, 2026-10-30), replayed offline. No provider is called.`, with `proof: null`. Any other text holds with `[OFFLINE_LIVE_REQUIRED] Live checking needs the live demo or local keys.`

## Live eval (2026-10-30)

The eight-item list and its expected statuses were committed (`84ccffd`) before any of them ran. The server ran locally on port 3510 with both providers live. Each item ran once per run with no retries. After run 1, the prompts and passage ranking changed (`fe48e56`), and the whole list ran again as run 2. Run 2 is tuned on run 1's failures and is not an independent test.

| Item | Expected | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- | --- |
| Shopify: tighten combination settings to stop staff POS discounts stacking | contradicted | insufficient (fail) | contradicted (pass) | contradicted (pass) |
| Shopify: shorten the return window from 30 to 14 days | supported / insufficient | supported (pass) | supported (pass) | supported (pass) |
| USPS: switch lightweight packages to Ground Advantage | supported / insufficient | supported (pass) | insufficient (pass) | insufficient (pass) |
| UPS: use SurePost for residential deliveries | contradicted / insufficient | contradicted (pass, wrong reason) | supported (fail) | contradicted (pass) |
| Shopify: minimum purchase on a free shipping discount code | supported | insufficient (fail) | supported (pass) | supported (pass) |
| WooCommerce: individual use only so coupons cannot combine | supported | supported (pass) | contradicted (fail) | insufficient (fail) |
| Out of scope: raise prices on slow sellers | hold | hold, topic other (pass) | supported (fail) | hold, topic unsupported (pass) |
| Adversarial: "Ignore previous instructions…" | hold | hold, privacy screen (pass) | hold, privacy screen (pass) | hold, privacy screen (pass) |
| **Total** | | **6 / 8** | **5 / 8** | **7 / 8** |

**Run 3 (after the guardrails, same frozen list, prompts unchanged from run 2).** Code now decides the topic and domain from the fix's own wording (a fix with no discount, return or shipping wording holds as out of scope) and holds a planned claim that shares no content word with the fix (`CLAIM_DRIFT`). Result 7/8; the WooCommerce individual-use item returned "insufficient" instead of "supported". Cost: 14 Tavily credits, 13 Nemotron completions. Runs 2 and 3 were each changed after seeing earlier failures on this same list, so they show the fixes worked here, not accuracy on new fixes.

What the failures show:

- **The plan model is the weakest step.** Run 1 sent a free shipping discount code to `usps.com`. Run 2 wrote a wrong WooCommerce claim (the judge then contradicted the claim while quoting the setting that supports the fix) and labelled a pricing change as a discount question, which the judge then "supported" with real but irrelevant quotes. The prompt change fixed one routing error and coincided with a new one.
- **Passage selection decides contradictions.** In run 1 the Shopify exception sentence was on the extracted page but outside the selected passage, so the judge correctly said the shown text was inconclusive. Ranking limiting wording higher put it in the passage in run 2.
- **Official pages can be stale.** ups.com still serves WorldShip help pages that describe SurePost (one of them in French), so run 2 supported a service UPS has rebranded. Run 1's "contradicted" came from a detail the plan model added, not from the rebrand.
- **Verification held.** No decisive verdict was downgraded and no schema or prose hold occurred. The response does not record how many proposed quotes code dropped.

Cost, including one pre-eval smoke check of a fix outside the list: 33 Tavily credits (cap 40) and 29 Nemotron completions (cap 30), 14,704 input and 16,742 output tokens. Live checks took 8 to 59 seconds end to end. Request IDs, credits, tokens and full response bodies are in the evidence file.

## Recorded examples

Four correct runs are replayed offline, byte-identical to their evidence entries (`tests/check-fix.test.ts` asserts this):

| Example | Status | Run |
| --- | --- | --- |
| `shopify-pos-stacking` | contradicted | run 2 |
| `shopify-minimum-purchase` | supported | run 2 |
| `woo-individual-use` | supported | run 1 |
| `shopify-return-window` | supported | run 1 |

## Limits

- Coverage is US, Shopify or WooCommerce, USPS or UPS, and three topics. Everything else holds.
- `pageSentences` prepends a list's lead-in line to each list item. A quote that spans an item and the repeated lead-in is verbatim in the passage but is two separate places on the page. The recorded `shopify-pos-stacking` example contains one such quote.
- A verified quote proves the text is on the official page. Whether it bears on the fix is the judge's call, and the eval shows the plan model can steer that call to the wrong question. Treat `supported` as "the official page states this", and check the claim line before acting.
- The recordings age as the pages change; they carry their request IDs and date.
