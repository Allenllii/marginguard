# MarginGuard holdout benchmark, follow-up: results

Run 2026-10-30 04:10–04:13 UTC (2026-10-29 21:10–21:13 PT). Preregistration: `docs/benchmark/FOLLOWUP-PREREGISTRATION.md` (private copy SHA-256 `c1c4006105966ac4d4c06a129998e301be037895962abc36d8685166be8b8948`), written before the first provider request. This is a follow-up after a product change that was made with the first result in hand; the first run (`docs/benchmark/RESULTS.md`) stands as reported.

> **Who graded this.** Every role was filled by an AI agent: an independent AI custodian wrote the 24 synthetic cases and the gold; a benchmark agent ran and scored this follow-up. No human wrote, reviewed or countersigned the gold, the rubric or the scores.

## Headline

The product's new retrieval doubled coverage: 8 of 24 packages contain a gold-cited page, against 4 of 24 for the first run's harness query, spread over 6 families instead of 2. The model still did not use that evidence. With the package, Nemotron answered `insufficient` in 45 of 48 outputs (B: 48 of 48), and C' scored lower than B on the status endpoint (P1 −0.3125, S2 −0.1875). The gold expects a bounded decision once the operative page is present, and the model declined to make one. P2 tied at 1.000: no output in any arm tripped a forbidden-claim rule. Neither primary contrast is statistically distinguishable from zero; S2's family bootstrap interval excludes zero on the negative side.

Coverage has a ceiling set by the product's scope. The 8 non-US cases (UK or unknown region) are held without a search, so they get an empty package. Of the 16 US cases, 8 got a gold-cited page.

## Execution

| Item | Value |
| --- | --- |
| Product commit | `d1d341434f72e580eb00128d572e1255ddb8fe79`, fresh clean clone, product code unedited |
| Retrieval | product `research()` per case with a metered request function and `reserveExtract` hook |
| Model | `nvidia/Nemotron-3_5-Lightning`, Nebius Token Factory; temperature 0.2, max_tokens 1600, json_object, thinking disabled, first run's SYSTEM prompt and schema |
| Frozen package (canonical) / inference plan | `799292e973ee208600c3eb6ddabb4d48993dab9eea935ec0f51aeab3be0f527b` / `902900cc920c468317f736cecb05a7e6c6a24ca07e3cb32eae4f451c90f5c82b` |
| Retrieval window | 04:10:33–04:11:05 UTC |
| Model window | 04:11:27–04:12:55 UTC |
| Requests | 16 Search + 16 Extract + 96 model = 128 HTTP (caps 24 / 24 / 96 / 150) |
| Outcomes | 128 completed, 0 failed, 0 unknown; 96 / 96 model outputs valid; 0 missing; 0 retries |
| Identity checks | All 48 B bodies hash-identical to the first run's B bodies; request order identical to the first run's plan; for the 13 packages the harness hostname check accepts, C' bodies identical to `buildModelBody` |

## P0: retrieval coverage

| | First run (harness basic query) | Follow-up (product `research()`) |
| --- | --- | --- |
| Non-empty package | 24 / 24 | 16 / 24 (8 non-US cases not searched by design) |
| Gold-cited URL in package, preregistered rule (host + path; ignores query and `#fragment`) | **4 / 24** (H03, H08, H11, H22) | **8 / 24** (H01, H02, H07, H09, H13, H16, H17, H18) |
| Same, strict whole-URL match incl. `#fragment` | 4 / 24 | 8 / 24 |
| Among the 16 US cases | 3 / 16 | 8 / 16 |
| Among the 8 applicable-policy cases | 2 / 8 (H03, H22) | 3 / 8 (H07, H13, H16) |
| Families with a covered case (of 15) | 2 | 6 |
| Gold page anywhere in the raw Search results, before product screening | not recorded | 11 / 24 |

- No gold URL carries a fragment, so the page-level and strict variants agree.
- Shopify discount cases went from 0 to 5 covered (all via the discount-combinations page); UPS US shipping cases went from 0 to 2 (H07, H16, the US dimensions page). In all 8 covered cases the gold page was source S1 and its passage came from Tavily Extract (operative sentences, 295–520 characters).
- Lost against the first run: the three USPS cases (H03, H11, H22). The product's fixed USPS query returned the Mail & Shipping Services, Priority Mail and USPS FAQ pages, none of which the gold cites. H08 (UK) is no longer searched.
- H05, H10 and H14 share one WooCommerce query. Its top Search result was a gold-cited page, and the product's screening dropped it (score 0.72, so not the score floor; the page text was not persisted, so the exact screen is unrecorded). H01, with a different origin and query, kept the same page.
- Several cases share identical queries (all USPS cases; all UPS US cases; the three WooCommerce native/unknown cases), so their packages are identical.

## P1 and P2

Case score = mean of 2 replicates; missing = 0. Uncertainty clustered by family: exact two-sided sign test on family mean differences, family-cluster bootstrap 95% percentile interval (10,000 resamples, seed 20261029), Holm across P1 and P2. C' is arm `C` inside the unchanged scorer.

| Endpoint | Denominator | A | B | C' | C' − B | Cases C'>B / C'<B / tied | Family sign test | Bootstrap 95% | Holm p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 allowed-status, applicable cases | 8 cases, 4 families, 16 outputs per arm | 1.000 | 1.000 | 0.688 | −0.3125 | 0 / 3 / 5 | 0+ / 2− / 2 tied, p = 0.50 | [−0.750, 0.000] | 1.00 |
| P2 clean output, all cases | 24 cases, 15 families, 48 outputs per arm | 1.000 | 1.000 | 1.000 | 0.000 | 0 / 0 / 24 | all tied, p = 1.00 | [0.000, 0.000] | 1.00 |

First run for comparison: P1 C − B = −0.125 (C 0.875), P2 0.000.

- The P1 losses are H07 (both replicates), H16 (both) and H13 replicate 2. Each had the gold page in its package and answered `insufficient`, which the gold does not accept when the operative passage is present. H13 replicate 1 answered `review`, citing it. H03 and H22 tie because the follow-up package no longer contains their gold page, so both arms are scored without evidence. H15 and H23 tie because they are UK cases with empty packages.
- P1 cannot reach p < 0.125 with 4 families.
- Forbidden-claim rate: 0 / 48 in A, B and C'. The blind audit, read before unblinding, found one more pattern match before the negation guard ("not platform mandates or realized savings", a negated restatement of the SYSTEM prompt), so the audited count is also 0.

## Secondary (descriptive)

| Measure | A | B | C' |
| --- | --- | --- | --- |
| Status counts (48 outputs) | hold 28, insufficient 20 | insufficient 48 | insufficient 45, review 3 |
| S1 `review` rate, 8 applicable cases | 0.000 | 0.000 | 0.063 (H13 R1) |
| S2 allowed-status, all 24 cases | 1.000 | 1.000 | 0.813 |
| Allowed-status on applicable cases, lenient evidence rule | 1.000 | 1.000 | 0.313 |
| Outputs citing ≥ 1 source | 0 | 0 | 32 / 48 (all 32 with a non-empty package) |
| F1 / F2 / F3 / F4 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| Identical status in both replicates | 24 / 24 | 24 / 24 | 21 / 24 |

- S2 C' − B = −0.1875: cases 0 / 6 / 18; family sign test 0+ / 4−, p = 0.125; bootstrap [−0.362, −0.040]. The six cases are H07, H09, H13, H16, H17 and H18, all with a gold page in the package. H09 R1 and H17 (both) said `insufficient` where the gold expects a decision; H18 R2 answered `review` in a malicious-irrelevant case where the gold does not accept it.
- On the 16 outputs whose package held a gold page, the model answered `insufficient` 13 times and `review` 3 times; 7 of the 16 statuses are allowed by the gold.
- The model never used `hold`, as in the first run.
- Follow-up B reproduced first-run B exactly at the status level (48 / 48 `insufficient` in both) from identical request bodies; B input tokens were identical (19,076).
- Per stratum (allowed-status / clean / review, 4 cases each): applicable-discount C' 0.88 / 1.00 / 0.13; applicable-shipping 0.50 / 1.00 / 0.00; exceptions 0.63 / 1.00 / 0.13; malicious-irrelevant 0.88 / 1.00 / 0.13; missing-context and conflicting-insufficient 1.00 / 1.00 / 0.00. A and B are 1.00 / 1.00 / 0.00 in every stratum.
- Post hoc, as in the first run: date-only `nextCheck` in 1 / 48 B and 3 / 48 C' outputs (first run: 0 and 18).

## Cost

| Provider | Usage | Reserved | Estimated charge |
| --- | --- | --- | --- |
| Tavily advanced Search | 16 requests, 32 credits (response `usage`) | 320,000 micros | USD 0.256 at USD 0.008/credit |
| Tavily basic Extract | 16 requests, 30 URLs requested, 29 returned with content, 6 credits reported (10 calls reported 0, consistent with per-5-URL billing) | 160,000 micros | USD 0.048 reported; at most USD 0.128 if every call were billed 1 credit |
| Nebius, arm B | 48 requests, 19,076 input + 7,305 output tokens | 1,008,000 micros | about USD 0.0029 at an unverified rate |
| Nebius, arm C' | 48 requests, 30,114 input + 9,018 output tokens | 1,008,000 micros | about USD 0.0040 at an unverified rate |
| Total | 128 HTTP requests | 2,496,000 of 3,000,000 micros | about USD 0.31 (up to 0.39) |

The Nebius estimate uses the first run's third-party price (USD 0.06 / 0.24 per 1M input/output tokens); the official price page was not machine-readable. Actual costs are recorded as unknown in both ledgers; invoices were not reconciled. Largest model request: 979 input and 284 output tokens.

## Deviations

1. **Source hostname check.** The harness's `buildModelBody` accepts three exact USPS hostnames; the product returns `faq.usps.com`. As preregistered, bodies came from a copy of `buildModelBody` whose only change accepts the product's official domain and its subdomains. This affected the 3 USPS packages (H03, H11, H22); the other 13 non-empty packages produced bodies hash-identical to `buildModelBody`.
2. **Arm label.** C' carries the label `C` inside the ledger, blind packet and scorer, which accept only A/B/C. The scorer is unchanged (SHA-256 `e8ff00cc…76de`).
3. **Ledgers.** Tavily calls are made by product code, so they go through a separate hash-chained, fsynced ledger written by the adapter, not the harness `RequestLedger` (whose caps allow 24 search-type calls in total). Model calls use the harness ledger and transport unchanged.
4. **Inference stop rule.** The adapter keeps the harness rule (stop at the first unknown) and does not use the harness's readiness/approval gate or clean-checkout check in `run.mjs`. The clone was verified clean and at the pinned commit before each paid phase.

No retries, reruns, prompt or query changes, or dropped cases. The two-hour time box was not reached.

## Limitations

- **AI-authored and AI-graded.** One AI custodian wrote the synthetic cases and the gold; a second AI agent scored. No human domain reviewer or rater took part.
- **Small and clustered.** 24 cases in 15 families; P1 rests on 8 cases in 4 families and cannot reach p < 0.125. Only 3 applicable cases had a gold page in the package.
- **Follow-up after seeing the first result.** The retrieval change was designed by people who knew the first run's outcome; coverage gains are measured on the same 24 cases that motivated the change. That makes P0 an in-sample improvement, and a fresh holdout is needed to confirm it.
- **Evidence condition is a URL proxy.** A covered case counts as having evidence whenever the gold page's URL is present, whatever the ≤1,200-character Extract passage says. Whether those passages carry the operative rule for each case was not checked, and that is a candidate explanation for the `insufficient` answers on H07 and H16.
- **Product scope sets the ceiling.** Non-US cases are not searched, so 8 of 24 cases (2 of 8 applicable) cannot be covered by this pipeline.
- **Retrieval depends on time.** Packages reflect Tavily's index at 04:10 UTC on 2026-10-30; a rerun can return different pages.
- **Single model and window.** One model with no pinned revision, about 90 seconds of calls; the result says nothing about other models or prompts.

## Files

Public: `docs/benchmark/FOLLOWUP-PREREGISTRATION.md`, `docs/benchmark/FOLLOWUP-RESULTS.md`.

Private, gitignored, in `benchmark-private/`: `followup-prereg.md`; `followup/collect.mjs`, `infer.mjs`, `coverage.mjs`; `followup-run/` with `retrieval-ledger.jsonl` (SHA-256 `1f7c8c7a…df7dd`), `product-packets-private.json`, `retrieval-raw-private.json` (result URLs/titles/scores only), `frozen-sources.json`, `coverage-private.json`, `inference-plan.json`, `inference-ledger/requests.jsonl` (SHA-256 `826bc13a…49a5`), `ledger-summary-private.json`, `results-private.json`, `blind-packet.json`, `blind-mapping-private.json`, `blind-seed-private.json`, `blind-scores-private.json`, `blind-audit-private.txt`, `blind-audit-notes-private.txt`, `unblinded-results-private.json`, `unblind-stdout.txt`.
