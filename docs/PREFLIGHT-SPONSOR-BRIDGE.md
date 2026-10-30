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
3. The seller's campaign description passes a local privacy screen, then goes
   to the NVIDIA **reasoning** model (`NEBIUS_REASONING_MODEL`, default
   `nvidia/nemotron-3-super-120b-a12b`), which must appear in the Nebius model
   catalog before one completion request is made. Nemotron converts free-form
   English into strict `PreflightRule` JSON (see "Nemotron interpretation").
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

## Nemotron interpretation and validation gate

Sellers can describe a campaign in plain English, for example
`20% off sitewide plus an extra $10 off orders over $75 for VIPs, stackable with free shipping`.
Nemotron returns exactly `{ "rules": [...], "unmodeled": [...] }`:

- `rules`: 0-3 items, each exactly one of `percent` (`scope` product/order,
  integer `basisPoints` 1-10000), `fixed` (integer `amountCents` 1-1,000,000) or
  `free_shipping`, each with integer `minSubtotalCents` (0-9,000,000) and
  `minItems` (0-9). No ids, totals, savings, prose or any other field.
- `unmodeled`: conditions the simulator cannot represent, from a fixed enum:
  `customer_segment`, `date_window`, `product_subset`, `usage_limit`,
  `discount_code`, `other`. They are reported to the seller, never simulated.

The model never computes money results. Deterministic gates, in order, each HOLD
with a static code and no model text:

1. zod strict schema (`MODEL_RULE_SCHEMA_INVALID`): wrong types, out-of-range
   integers, extra fields such as `contributionCents`, unknown conditions.
2. Existing engine validator `validatePreflightInput` (`MODEL_RULE_VALIDATION_FAILED`):
   duplicate semantics and engine ranges. Rule ids `R1..R3` are assigned locally.
3. Grounding (`MODEL_VALUE_UNGROUNDED`): every non-zero value must equal a number
   the seller wrote, in hundredths (20% -> 2000 bp, $75 -> 7500 cents, 2 items).
   Numbers written as words are not grounded and HOLD.
4. Grammar cross-check: the narrow local grammar (product/order percentages and
   free shipping separated by then/and/commas) still parses what it can. If it
   parses the text and disagrees with Nemotron in count, order, scope, rate or
   threshold, the result is `MODEL_GRAMMAR_MISMATCH` HOLD. If it agrees, the
   proposal is `interpretation: "grammar_confirmed"`. If the text is outside the
   grammar, validated model rules are accepted as
   `interpretation: "nemotron_interpreted"` with the reason
   "Interpreted by Nemotron — review before simulating".

Every accepted proposal still requires the explicit seller confirmation below.
Thresholds use the engine's `>=` semantics; "over $75" is simulated as at least
$75. Customer segments (e.g. VIP-only) are listed as unmodeled, so the simulation
applies the discount to every basket, which is the conservative margin case.

## Model routing

| Call | Env | Default |
| --- | --- | --- |
| Explain / remediation drafts (fast, everyday) | `NEBIUS_MODEL` | `nvidia/Nemotron-3_5-Lightning` |
| Campaign intent interpretation (reasoning) | `NEBIUS_REASONING_MODEL` | `nvidia/nemotron-3-super-120b-a12b` |

`nvidia/Nemotron-3-Ultra-550b-a55b` can be set as the reasoning model. Each
configured ID must be returned by `GET /v1/models` before its completion; there is
no substitution. `GET /api/health` reports `models: { fast, reasoning, routing }`.
The intent call uses `temperature: 0`, `max_tokens: 4096` (room for reasoning),
a 90 s timeout, a 200 KB response-body bound and `finish_reason: stop` only.

### Local live check, 2026-10-30 (03:01-03:04 UTC)

Sanitized ledger: `evidence/live-intent-20261030.json` (5 completions, 2 Tavily
credits, no retries). Through the real local server, the VIP example above
returned `NEEDS_CONFIRMATION` / `nemotron_interpreted` from Super (412 prompt,
1018 completion tokens of which 899 reasoning, 9.8 s): 20% product, $10 fixed at
a $75 minimum subtotal, free shipping, `customer_segment` unmodeled. Confirmation
then ran the integer engine with zero provider requests (HOLD on fixture
evidence). Ultra produced identical rules (5.2 s). A grammar campaign returned
`grammar_confirmed`. Two failures are recorded: a second prepare 35 s later was
held by the per-minute budget after Search had spent a credit, and the fast-model
explain call returned prose with digits, so its existing validator fell back.

## Privacy boundary

The campaign description itself is sent to Nemotron. Before any provider request,
a local screen rejects text over 240 characters, characters outside
`A-Z a-z 0-9 space % $ . , ; : ' & + - / ( ) !`, emails (`@`), URLs and domains,
digit runs of five or more (order IDs, phones, cards), more than two decimals and
prompt directives. Do not put customer names or data in the description; the
screen cannot recognize names. No CSV, order/SKU identifier, cost, shipping fee,
seller evidence reference or retrieved policy prose is sent to either provider.
Tavily receives only a fixed public documentation query/URL. Economic inputs
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
in [SPONSOR-BRIDGE-REVIEW.md](SPONSOR-BRIDGE-REVIEW.md). That historical probe did not establish a successful bridge. The subsequent
local diagnostic follow-up verified the controlled synthetic UI loop; see
[BRIDGE-DIAGNOSTICS.md](BRIDGE-DIAGNOSTICS.md). No production-readiness claim is made.

Protocol references inspected for this implementation:
[Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search),
[Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract),
[Shopify combining discounts](https://help.shopify.com/en/manual/discounts/discount-combinations).
The NVIDIA completion URL, exact model controls and catalog check reuse the
repository's existing `server/nebius.ts` contract.
