# Independent audit follow-up

Audit input: the local candidate ZIP with SHA-256
`2c9b080b17b59fdaba37fe02f15202cd6d75800c168b45897c3214aaf7bc80bb`.
That immutable prior candidate remains the reviewed input; it is not the fixed
release. No live provider requests or final benchmark are part of these fixes.

## Corrections implemented

- Policy-to-Test now requires the complete recorded passage to match its narrow
  rule catalog. Unknown follow-up sentences HOLD the entire packet; a selected
  positive candidate cannot discard a retraction, expiry or contrary condition.
  Exact review reminders are allowed only in authored fixture mode.
  Unrecognized titles also HOLD; a caller-supplied `global` tag cannot bypass
  unknown scope qualifiers outside the declared title catalog.
- Shared source-scope checks inspect titles and body text. Explicit incompatible
  or unidentified regional restrictions HOLD. Tavily source screening inspects
  its full returned content before selecting an excerpt, and no longer assigns
  `global` merely because no region was detected. Unspecified source scope stays
  unspecified. These are conservative screens, not general semantic validation.
- Analysis data remains mounted when switching workspaces, while global modal
  and navigation effects are gated by the active workspace. A hidden drawer no
  longer owns scroll or keyboard handling. Cleanup restores the prior overflow
  value and avoids focusing a hidden element.

The new tests first reproduced both policy failures and the browser-history
scroll lock. The first browser attempt had a stopped local server; it was an
infrastructure failure, then the real product failure was reproduced after
restart. Final counts and artifact identities are in the local audited handoff.

## Smallest useful next improvements (assessed, not implemented)

**Policy-to-Test audit download** should be a separate local JSON export owned
by the lab. A pure allowlisted builder can record the selected action, all three
cards and their verdicts/missing evidence, exact accepted quote/source IDs and
URLs, packet research ID, checked time, declared mode and returned provenance.
It must explicitly label authored fixtures, state that provenance is inherited
and not authenticated by the export, include no raw CSV, and make no new request.
Do not serialize the entire packet or a model object with unknown extra fields.
Test a changed hypothesis, all-HOLD packet and a fixture export, plus one browser
download with zero new network requests. This avoids coupling lab state to the
existing Markdown export in PolicyResearch.

**Same-basket A/B comparison** should let a user pin a validated run as A, edit
promotion rules manually, and calculate B. A pure comparison must require the
same SKU IDs/prices/costs, quantities, currency, shipping costs/charges, fees and
floor. Otherwise show HOLD with no delta. For a comparable pair, display the
shared maximum-quantity basket's no-promotion baseline, A full-stack contribution,
B full-stack contribution and B-minus-A cents. Show each run's overall worst
scenario separately, since its basket may differ. Keep both input snapshots and
rule orders in the optional local JSON download. Preserve both runs' HOLD reasons;
a positive delta never supplies eligibility evidence or becomes realized savings.
The existing synthetic example would show `$20` baseline, `-$6` A and `$2` B after
manually omitting the order rule; the modeled difference is `$8`, both runs HOLD.

These changes need no new endpoint, provider, credential, store connection or
execution capability. They are preferable to broadening the simulator or adding
another dashboard. Actual coverage on unfamiliar live excerpts remains a separate
review gate; fixture routing and reference membership do not measure fidelity.
