# Promo Preflight sponsor bridge: reviewed preparation and confirmation

This additive slice connects real Tavily Search/Extract and Nebius NVIDIA HTTP
protocols to the existing service, behind injected fetch and the existing live
guards. The optional browser section separates a zero-request synthetic preview
from explicit live preparation and a second confirmation for simulation. Most
regressions use labeled mock responses. One authorized actual local probe made
two Tavily requests and then held; it made no NVIDIA request. No customer data,
new credential, deployment or external submission is part of this change.

## Supported flow

1. `POST /api/preflight/prepare` accepts a restricted seller-authored campaign,
   existing context, and explicit `live: true`. It accepts no CSV, URL, SKU, cost,
   customer field, policy packet or caller-supplied source.
2. Tavily Search uses a fixed query restricted to `help.shopify.com`. Extract
   receives only the exact catalog URL returned by Search:
   `https://help.shopify.com/en/manual/discounts/discount-combinations`.
3. The local lexer replaces rate literals with opaque `N1`/`N2` references. Only
   that canonical vocabulary and references reach Nebius. A fixed NVIDIA model
   must appear in its model catalog before one completion request is made.
4. A successful parse returns `NEEDS_CONFIRMATION`, exact integer engine rules,
   a random proposal ID valid for ten minutes, `requiresSellerConfirmation:
   true`, `applyAutomatically: false`, and `checkoutVerified: false`. It does not
   run a simulation or update seller evidence.
5. A caller shows those rules to the seller. After an explicit seller action,
   `POST /api/preflight/confirm` accepts `confirmed: true`, the proposal ID and
   the existing `PreflightInput`. Rules must match the stored snapshot exactly.
   Confirmation runs the existing integer engine and consumes the proposal. It
   makes zero provider requests. No provider-derived evidence flags are set.

Example preparation body (synthetic):

```json
{
  "activity": "20% product discount then 20% order discount then free shipping",
  "context": {
    "platform": "Shopify",
    "carrier": "USPS",
    "region": "US",
    "discountOrigin": "native"
  },
  "live": true
}
```

Confirmation body: `{ "proposalId": "<returned UUID>", "confirmed": true,
"input": <existing PreflightInput with the exact returned rules> }`. All fields
are strict. A proposal is single use and scoped to one service instance. An
isolate restart, expiry or eviction from the bounded fifty-proposal cache safely
requires preparation again. The cache stores only proposed rules and expiry,
never the campaign string, seller economics or evidence references. It is not an
authentication mechanism; the routes inherit existing same-origin protections.

Simulation labels remain `HOLD`, `REVIEW` or `MODEL_CLEAR` under the original
engine rules. Fixture values and unknown semantics still HOLD after confirmation.
Even a seller-attested simulation always reports `checkoutStatus: HOLD` and
`checkoutVerified: false`; official documentation is reference evidence, never
proof that this store, plan or promotion qualifies or that checkout was tested.

## Privacy and parsing boundary

The deliberately narrow English grammar accepts one to three clauses: a product
or order percentage discount and free shipping, separated by `then`, `and` or
commas. Forms include `20% product discount`, `20 percent discount on products`,
and `order discount of 20%`; optional `apply`, `offer`, and `a` are supported.
Rates are decimal literals from 0.01 through 100 with at most two fractional
digits. The lexer converts those literals to integer basis points locally.

Unknown vocabulary, personal names, emails, IDs, URLs, markup, control characters,
instructions, customer segments, thresholds, fixed-amount discounts and languages
outside this grammar HOLD before the first provider request. Thus this is a
bounded natural-language validation bridge, not an unrestricted activity planner.
The local lexer already recognizes the permitted clauses; NVIDIA must reproduce
their exact count, order, scope and literal references. Its response cannot add,
omit or alter an action or introduce a numerical result. That conservative overlap
is intentional: model output is untrusted and supplies no monetary authority.

Neither provider receives raw customer data. Tavily receives only a fixed public
documentation query/URL. NVIDIA receives only canonical campaign words and opaque
references: no raw campaign string or rate literal, CSV, order/SKU identifier,
cost, shipping fee, seller reference or retrieved policy prose. Economic inputs
arrive only at confirmation and remain in the deterministic server calculation.

## Safety and request accounting

- The sole Extract target requires exact byte-for-byte catalog membership. URL
  credentials, alternate hosts/ports, IPs, query strings, fragments, encoded paths
  and normalization tricks cannot become a target. All HTTP fetches target only
  four hardcoded provider endpoints and use `redirect: error` with timeouts.
  The app never fetches a result URL itself. Tavily's own internal fetching is
  outside this application's control; its returned URL/content is rechecked.
- Search and full Extract content are bounded and checked before shortening the
  displayed excerpt. Missing/malformed `failed_results`, any extraction failure,
  duplicate/missing/mismatched URL, irrelevant source, suspicious instructions,
  unresolved scope, expiry, region mismatch or detected contradictory clause
  keeps HOLD. These are conservative exclusion rules, not a general semantic
  policy verifier; ambiguous or qualified documentation may HOLD for review.
- The existing `LiveBudget.reserve('tavily' | 'nebius')` runs before **each**
  physical attempt: Search, Extract, model catalog, completion. A successful
  pipeline consumes two reservations per provider. Default per-minute limits
  therefore allow one pipeline per minute. Failed and uncertain requests still
  consume their reservations; no refunds or hidden retries occur.
- Public durable-budget requirements, verified hard caps, authorization expiry,
  shared in-flight locks, API rate limiting and provider cooldowns remain in
  `createService`. HTTP 429 cooldowns are shared with existing routes. The bridge
  has a separate hard ceiling of four total attempts. The evaluation-only
  `scripts/lib/request-meter.ts` is not imported into production.
- Bounded metadata records endpoint/provider/status/outcome and total attempts.
  A transport rejection is recorded as an unknown possibly consumed outcome.
  It never records request bodies/headers, keys, arbitrary errors, provider
  completion text, reasoning or customer fields. Credential echoes in accepted
  policy content cause HOLD without returning that content.
- Independent integration review moved excerpting to complete supporting sentences
  with adjacent constraint text and retained credential checks on the full source.
  It also corrected HTTP-date and long delta Retry-After handling using the shared
  service clock. See [review and remaining live gates](SPONSOR-BRIDGE-REVIEW.md).
- Disabled/missing config and `live: false` explicitly return fixture HOLD with
  zero attempts. Attempted failures HOLD with no fallback successful proposal.
  The forced-offline Worker ignores runtime credentials for these routes too.

## Minimal integration and validation

The API boundary changes `server/service.ts`. New backend modules are
`server/preflight-policy.ts`, `server/preflight-intent.ts` and
`server/preflight-bridge.ts`; existing Express and Worker routers inherit the new
paths. `src/PreflightSponsorBridge.tsx` owns UI orchestration, with a strict
shared response contract and separate styles. The sandbox retains the integer
engine and records confirmed preparation provenance in its JSON audit. There is
no dependency, database schema, secret configuration or economic engine change.
Existing approved provider settings are reused;
neither a new key nor a live verification step is required for mock development.

```sh
node --import tsx --test tests/preflight-policy.test.ts tests/preflight-intent.test.ts tests/preflight-bridge.test.ts
npm test
npm run lint
npm run build
npm run benchmark:test
```

Tests cover malicious URLs/text, full-document and cross-stage conflicts,
`failed_results` on HTTP 200, invented/dropped/reordered model actions, refusal,
truncation, budget exhaustion before every stage, unknown outcomes, public caps,
expiry, shared cooldown/in-flight guards, exact confirmation, replay/expiry,
fixture preservation and end-to-end mock integer-engine parity. Real provider
verification is separate from mock pass counts. The controlled October 29 probe
returned HOLD after HTTP-200 Search and Extract; no usable proposal, confirmation
or model completion resulted. See the request observations and remaining gates
in [SPONSOR-BRIDGE-REVIEW.md](SPONSOR-BRIDGE-REVIEW.md). This slice makes no
full-pipeline live-success or production-readiness claim.

Protocol references inspected for this implementation:
[Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search),
[Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract),
[Shopify combining discounts](https://help.shopify.com/en/manual/discounts/discount-combinations).
The NVIDIA completion URL, exact model controls and catalog check reuse the
repository's existing `server/nebius.ts` contract.
