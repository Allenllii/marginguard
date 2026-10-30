# Sponsor bridge integration review

This is a local, independent review of upstream `91e0fc9a1761aaee9c9502c7619ae62c392059d3`.
The API slice was first verified with injected mock transports. The subsequent
local UI integration and one controlled actual probe are recorded separately
below. No new credential, public live endpoint, deployment or final benchmark
is part of this increment.

## Boundaries checked

- Search uses fixed public vocabulary. Extract accepts only the exact catalog
  URL actually returned by Search. URL-normalization tricks, local/metadata
  addresses, redirects, duplicate results and per-URL failures hold.
- Every physical HTTP attempt reserves the existing provider budget first.
  There are at most four attempts and no retry. Public durable-budget, expiry,
  hard-cap and shared in-flight/cooldown guards remain in the service.
- The activity lexer accepts a narrow grammar. Only canonical vocabulary and
  opaque rate references enter the model request. Numeric literals stay in the
  lexer; costs, SKUs and seller evidence arrive only at confirmation and never
  enter either provider. Model output must match the local action snapshot.
- A successful prepare creates a bounded, expiring random proposal. Confirm
  requires its exact rules and explicit `confirmed: true`, consumes it once,
  and runs the existing integer engine with zero provider requests. Checkout
  eligibility stays HOLD. This protocol cannot authenticate a human action;
  the UI exposes review and a second explicit confirmation step. A checkbox is
  user intent within this application, not authentication or merchant verification.
- Real loopback HTTP regression covers hostile Origin, unknown private fields,
  oversized bodies, disabled providers and a fabricated confirmation ID.

## Reproduced corrections

Two new tests first failed on the integrated upstream code:

1. A long introduction displaced the operative policy clause beyond the first
   1,200 characters. Excerpts now select complete contiguous supporting sentences
   and nearby constraint text. No bounded supporting excerpt means HOLD; full
   source safety checks still run before selection.
2. HTTP-date Retry-After was reduced to the default delay, and long numeric waits
   were capped at one hour. Both formats now use the injected service clock and
   preserve the upstream wait for a later explicit request.

The existing credential-echo regression caught a side effect of shortening the
excerpt. A content-veto callback now checks the complete accepted source before
selection; a credential echo keeps the whole response content out of the result.
The policy adapter receives no additional credential values through that callback.

## Remaining product and live-validation gates

The browser sandbox now offers a separate policy-assisted preparation section.
Opening it sends no request. Synthetic preview stays entirely client-side and
uses a fixed labeled example. Availability checking makes only an app health
request; one-use live consent precedes preparation, and a separate rule-review
checkbox precedes confirmation. Changes, cancellation, workspace navigation and
unmount invalidate delayed replies. The model parses an already normalized grammar;
it does not independently discover campaigns or calculate margin. Tavily provides
a conservative reference gate, not verified merchant applicability or checkout
behavior. Mixed-scope official documents can HOLD. Actual extraction coverage is
not established by mock pass counts.

One controlled local probe can be prepared after the operator verifies approved
local access, free-credit balance and its concrete request plan. Use one synthetic
native Shopify/US campaign. Permit at most one Search, one Extract, one model-list
request and one completion (`max_tokens: 600`); stop at the first HOLD or failure.
Do not retry, change model, broaden source URLs or silently repair the response.
Record actual request IDs, observed latency, returned usage/credits and failure
stage through a bounded redacting verifier before describing it as live proof.
The current bridge trace itself records endpoint/status/attempt outcome, not
complete sponsor billing or request-ID evidence. Confirmation is a separate
explicit local action with zero new provider attempts. Do not load real merchant
data for this probe or configure hosted keys.

### Actual controlled probe, October 29 at 23:58 UTC

The approved local probe made exactly two physical requests, with zero retries:

| Stage | HTTP | Observed latency | Returned request ID | Returned credits |
| --- | --- | ---: | --- | ---: |
| Tavily Search | 200 | 3261.226 ms | `d8ff6109-6391-4aed-b88b-5348c736d72b` | 1 |
| Tavily Extract | 200 | 80.822 ms | `ad865679-80c5-4e3f-8269-89f268f627e5` | 0 |

The preparation returned **HOLD** after extraction. No NVIDIA model discovery or
completion was attempted, no proposal was issued, no confirmation occurred and
no money evaluation ran. HTTP success does not establish usable policy evidence.
The redacting probe did not retain response content or a precise validation
reason, so these observations do not identify which extraction check held. The
one-shot proof remains local and must not be overwritten or silently retried.
This is a failed full-pipeline validation, not a successful live bridge demo.

The UI success path is tested with explicitly mocked responses. Its exported
audit distinguishes synthetic fixture preparation from a live server response,
includes the rule-review timestamp and source references, and keeps monetary
results under the integer engine. Neither path establishes real checkout behavior.

The separately approved footer correction is now public through PR #20, merged
at `9bade621874e08359b901b1fe03729619176334c`. This bridge increment must be
compared against that main revision; it does not deploy a new Sites version.

References: [Tavily Extract](https://docs.tavily.com/documentation/api-reference/endpoint/extract),
[Shopify combination conditions](https://help.shopify.com/en/manual/discounts/discount-combinations),
[RFC 9110 Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after).


### Subsequent local diagnostic follow-up

The historical failure above is retained. The follow-up isolated a conditional
policy-denial false positive, a non-geographic merchant-eligibility qualifier,
and Nebius null tool metadata. Each received a regression before its fix. A
later controlled synthetic browser loop reached explicit simulation confirmation;
the money engine remained deterministic and real checkout stayed HOLD. New raw
logs and request observations stay local; see BRIDGE-DIAGNOSTICS.md for the narrow
reference contract. Source publication and the separately versioned offline Site
must be verified independently. Final benchmark and video remain unrun.
