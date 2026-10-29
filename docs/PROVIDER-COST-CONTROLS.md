# Provider cost-control release gate

Checked against official public documentation on October 29, 2026. This is an engineering release check, not a change to billing settings. Project request counters, rate limits, a billing threshold and a monetary hard stop are different controls.

## Nebius Token Factory

The [billing documentation](https://docs.tokenfactory.nebius.com/other-capabilities/billing-new) describes automatic card charging when a balance is negative at a month boundary or a configured billing threshold is reached. A threshold triggers collection; it does not promise to stop inference at a chosen spending amount. The inspected billing/usage navigation did not establish a configurable project/key monetary hard stop. RPM/TPM controls limit speed, not total money. Therefore the project must continue treating a Nebius monetary cap as **unverified**, rather than inferring safety from promotional credit or a request-rate setting.

The same documentation distinguishes a short-lived signup trial from special-offer promo codes and confirms that redeemed credits appear as balance adjustments. The [Builder Program terms](https://nebius.com/builders-terms-and-conditions), section C, describe promotional credits expiring ninety days after issuance and possible subsequent PAYGO use. Offer-specific instructions may differ; confirm the terms and expiry applicable to an issued code. Do not assume that an applied balance necessarily prevents future charges.

## Tavily

The [pricing documentation](https://docs.tavily.com/documentation/api-credits) describes a free Researcher allowance of one thousand credits per month, Basic Search costing one credit, and optional paid usage. The [monthly-limit instructions](https://help.tavily.com/articles/8280756099-how-to-set-a-limit-for-pay-as-you-go-option) document a PAYGO usage-limit toggle, monthly value and confirmation step. Those controls were inspected read-only; this phase did not enable PAYGO or change any cap. The Search API documents [plan-limit and PAYGO-limit errors](https://docs.tavily.com/documentation/api-reference/endpoint/search) as distinct outcomes; the adapter already handles both without paid retries.

The [credit-reset article](https://help.tavily.com/articles/6846808029-understanding-api-credits-reset) states that allowance resets occur on the first calendar day of each month, independently of billing-cycle changes. Free monthly allowance, purchased usage and third-party promotional credits should not be treated as the same credit lifecycle. Account-specific offer validity must be checked separately.

## Hosted release implication

Keep `PROVIDER_HARD_CAPS_VERIFIED` false while a required provider hard stop is unverified. Durable application budgets and short authorization windows remain additional controls, not substitutes for a provider monetary cap. No hosted secrets were configured and no public live endpoint was opened. Resolve the Nebius stop/charge boundary and offer expiry with authoritative confirmation before claiming this gate complete. Private account observations are retained outside the public project.
