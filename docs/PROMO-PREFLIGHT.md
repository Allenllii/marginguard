# Promo Preflight sandbox

An offline, bounded collision test for seller-authored promotion assumptions. This
slice extends MarginGuard from inspecting historical orders to inspecting a
proposed promotion before launch. It does not connect to a store, place orders,
change promotion settings, authenticate policy evidence, or call a model.

## Run

Requires the repository's Node.js 24.19+ and locked npm dependencies. No key,
account, extra package, migration, generated dataset or environment file is needed.

```sh
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run dev
```

Open `http://127.0.0.1:3000/#preflight`, or choose **Promo Preflight** in the
existing sidebar. Direct entry mounts only the sandbox; it makes no API request.
After visiting either workspace, ordinary hash navigation preserves its in-memory
state. Returning to analysis keeps the imported dataset and seller assumptions;
returning to the sandbox keeps its draft/result. Inactive content is hidden from
the accessibility tree and keyboard focus. Reload still resets this local session.
Global drawer and mobile-navigation effects are additionally gated on the active
workspace; browser Back cannot leave a hidden drawer trapping scroll or keys.
The page calculates in browser memory. Its optional JSON download includes the
input snapshot, formula, assumptions, evidence gaps, search bounds and traces.
Editing any input clears the old result and removes its export button.

Run the small, reproducible synthetic example in a terminal:

```sh
node --import tsx scripts/preflight-demo.ts
```

## Synthetic golden example

One item costs the customer $50.00 before discounts. COGS is $30.00. Shipping
costs the seller $8.00 and originally costs the customer $8.00. Payment fees are
explicitly zero for this example. Assume the seller's proposed product discount,
order discount and free shipping can combine in that sequence.

| Stage | Merchandise | Shipping collected | Contribution |
| --- | ---: | ---: | ---: |
| No promotion | $50.00 | $8.00 | $20.00 |
| Product 20% | $40.00 | $8.00 | $10.00 |
| Then order 20% | $32.00 | $8.00 | $2.00 |
| Then free shipping | $32.00 | $0.00 | -$6.00 |
| Seller-edited candidate: omit order 20%, keep product 20% + free shipping | $40.00 | $0.00 | $2.00 |

These are synthetic modeled contributions. Both fixture variants remain HOLD;
positive contribution does not supply missing evidence or represent realized
savings. The candidate is a manual simulator edit, not a recommended store action.

The [Shopify combining-discounts reference](https://help.shopify.com/en/manual/discounts/discount-combinations)
describes product, revised-subtotal order and shipping sequencing where eligible,
and requires merchants to check eligibility and combination settings. This link
does not establish that a particular store or promotion qualifies. This sandbox
also searches other orders as hypothetical stress scenarios; it is not a Shopify
execution emulator.

## Exact model and boundaries

- USD only; 1-3 distinct SKUs; each price/unit cost 0-1,000,000 cents.
- The quantity cap is 1-3 **per SKU**. Quantities 0 through the cap are searched,
  excluding the empty basket. Three SKUs at cap 3 produce `4^3 - 1 = 63` baskets.
- Zero to three rules: percentage in integer basis points, fixed merchandise
  discount in cents, or removal of the customer shipping charge. Product/order
  are user-authored stage labels; both percentages reduce the remaining basket
  merchandise total. This slice has no per-SKU targeting or line-level allocation.
- Every ordered subset is considered, including no rules; a rule appears at most
  once. Three rules produce `1 + 3 + 6 + 6 = 16` sequences. Hard cap: **1008**
  basket/sequence combinations. There are no hidden retries or unbounded search.
- Each percentage and payment fee rounds half up separately using BigInt integer
  arithmetic. Fixed discounts are capped at remaining merchandise. No negative
  merchandise or negative shipping charge is generated.
- Rule eligibility uses the original merchandise subtotal and original total
  item count. Shipping charge and shipping cost are fixed per nonempty basket.
  Free shipping removes the customer charge; seller shipping cost remains.
- Payment fee = half-up `(discounted merchandise + shipping collected) * bps /
  10000`. There is no fixed payment fee.
- Contribution = merchandise after discount + shipping collected - COGS -
  seller shipping cost - payment fee. The contribution floor is an absolute cents
  amount, not a percentage margin. Exactly meeting the floor is not a breach.
- The worst result is the lowest absolute contribution over the bounded search.
  Ties retain the first scenario in deterministic enumeration. The baseline and
  full-stack trace instead use all SKUs at maximum quantity and rules in input
  order. They may therefore use a different basket from the worst result.
- Taxes, returns, refunds, demand, fixed overhead, marketing, duties, fulfillment
  tiers, real checkout qualification and platform-specific rounding are excluded.
  Unsupported mechanics should remain unconfirmed and HOLD.

The input boundary rejects unknown/missing fields, unsafe identifiers and text,
noninteger/unsafe/out-of-range amounts, duplicate IDs (case insensitive), duplicate
rule semantics and sparse arrays. It returns a detached snapshot and never
mutates caller input. Rendering uses React escaping; no user content is inserted
as HTML or used as a URL, command, provider instruction or store action.

## Evidence labels

`HOLD` takes precedence over the money result when input provenance is fixture,
semantics/eligibility have not been explicitly confirmed, or a required seller
reference is absent. Costs and operations references are required; a rule
reference is required when promotion rules exist. The risk breach is exposed
separately, so a held example can still show negative contribution.

A seller can explicitly attest to the input references and simulation assumptions.
With all required references and semantics confirmed, the labels become `REVIEW`
when a scenario is below the floor, or `MODEL_CLEAR` otherwise. Neither label
means checkout verification, launch approval, independent document verification,
accounting profit or actual savings. Checkbox and reference text are assertions,
not authenticated evidence.

## Optional adapters and integration

`shared/preflight.ts` is a pure module with no dependencies on existing APIs or
providers. Public entry points are `runPreflight(unknown)`,
`validatePreflightInput(unknown)`, `PREFLIGHT_FIXTURE` and
`PreflightValidationError`.

`shared/preflight-adapters.ts` provides two **unwired pure boundaries**:

- `projectPreflightPolicyPacket(packet, requestedScope)` accepts a constrained
  version of the existing `ResearchPacket` contract, validates official reference
  URLs and scope, and returns references only. It always returns HOLD and
  `checkoutVerified: false`; even a packet labeled live does not authenticate
  activity eligibility or update simulator evidence.
- `parsePreflightProposal(candidate, allowedReferences)` accepts only a bounded
  proposal to omit existing rule IDs, with known source IDs and plain rationale.
  It returns `offline-proposal`, `model: null`, `requiresSellerReview: true` and
  `applyAutomatically: false`. It never applies a proposal, calls Nemotron or
  claims semantic support merely because a source ID exists. A future transport
  adapter must preserve those boundaries and be tested separately.

The original offline slice added no endpoint, server handler, database change or
provider transport. Its existing-file changes were the lazy `#preflight` entry
in `src/main.tsx` and one sidebar link in `src/App.tsx`.

An additive [sponsor bridge API slice](PREFLIGHT-SPONSOR-BRIDGE.md) now implements
restricted Tavily Search/Extract and NVIDIA intent validation behind existing
service guards, with an explicit confirmation endpoint. It does not wire the
browser sandbox to providers or change its local calculation and privacy claims.
See that document for the exact interfaces, supported grammar and mock-only
verification boundaries.

## Regressions

```sh
node --import tsx --test tests/preflight.test.ts tests/preflight-adapters.test.ts
npm test
npm run lint
npm run build:frontend
npx playwright test --config scripts/preflight-playwright.config.ts
```

Upstream commit `9a258a2e0e421ca4ac4d749da99320af4eb2d0f4` reported 35 new
engine/adapter tests and 11 sandbox browser tests on main `868ff2e`. Integration
review independently reran all 35 tests and added a twelfth browser regression
that first reproduced lost imported data when switching workspaces. It passed
after retaining visited workspaces in memory. All 12 sandbox browser tests passed;
final combined checks are recorded in the local integration handoff. Raw upstream
screenshots and reports were excluded from the integration patch.

The browser configuration runs both existing and new journeys and starts a
separate local server at port 4178 in offline QA mode. It does not load secret
files. Tests check the golden collision, omission,
stale exports, strict input errors, upper search bound, zero rules, HOLD progression,
JSON replay fields, no API/provider requests, return navigation, keyboard focus,
control labels, reduced motion and 320/390/1440px layouts. Screenshots and a compact
verification record accompany the commit. This is development regression testing;
no final benchmark, video recording, publication or paid provider request occurred.
