# MarginGuard holdout benchmark: results

Run 2026-10-30 03:13–03:17 UTC (2026-10-29 20:13–20:17 PT). Preregistration: `docs/benchmark/PREREGISTRATION.md` (SHA-256 `74aac33922ef33d218c2f3a7bd1bfd2a98fa7f65705c48d69fbd9a781c2701dd`), written before the first provider request.

> **Who graded this.** Every role here was filled by an AI agent. The 24 synthetic cases and the gold were written by an independent AI custodian; the run and the scoring were done by a second AI agent. No human wrote, reviewed or countersigned the gold, the rubric or the scores. The runner's readiness flags were set `true` with the meanings recorded in the preregistration, `holdoutSealedByIndependentAuthor` included, even though the author is an AI agent and not a human.

## Headline

The frozen Tavily package did not improve Nemotron's decisions on this holdout. With or without the package, the model almost always answered `insufficient` (93 of 96 outputs). Arm C scored slightly lower than arm B on the status endpoint (−0.125, two half-cases), and the two arms tied on the forbidden-claim endpoint, where no output in any arm tripped a rule. Neither difference is statistically distinguishable from zero.

What limits the comparison is retrieval. Only 4 of the 24 packages contained a page the gold relies on, and only 2 of those 4 were among the 8 applicable-policy cases. For most cases, arm C got official pages from the right domain that did not state the operative rule, and the model correctly said they were insufficient. The B–C contrast therefore says little about what the model does once it has the right passage. The one place this run can see that (H03 and H22, 2 cases × 2 replicates) gave one bounded `review` and one `insufficient` per case.

## Execution

| Item | Value |
| --- | --- |
| Product commit | `e0153a4b81ce2b511e5e86f847409c7d3bd05e7f`, run from a clean local clone (see deviations) |
| Runner fingerprint | `1d71ef5182062631df277612382002e9b54c1950598e8dc730a1b32775664b29` |
| Dataset | `mg-final-holdout-v1`, canonical `ba28b3df0002b1acc2c8bfca49c349a3bba1c8425f9680aebf99e99bdf516fdd` |
| Retrieval plan / inference plan | `f2dec074…d9365` / `c29c6993834cdd84aadcad5cbfb3ce01776d101feb2bd0bd07f3bd3d46fa05eb` |
| Frozen source package (canonical) | `54b4277150469d02847d3c561ff793121b24f821eeed2a6e607958bda9af223c` |
| Model | `nvidia/Nemotron-3_5-Lightning`, Nebius Token Factory, temperature 0.2, max_tokens 1600, json_object, thinking disabled, same body builder for B and C |
| Search window | 03:13:40–03:14:27 UTC |
| Model window | 03:14:48–03:16:25 UTC |
| Requests attempted | 24 search + 96 model = 120 of 120 allowed |
| Outcomes | 120 completed, 0 failed, 0 unknown, 0 refused, 0 truncated, 0 schema-invalid |
| Missing outputs | 0 |
| Retries | 0 |

## Retrieval coverage

| | Cases |
| --- | --- |
| Search completed with ≥1 validated official passage | 24 / 24 (1 case got 1 passage, 5 got 2, 18 got 3) |
| Package contains a gold-cited URL (preregistered evidence rule) | 4 / 24 (H03, H08, H11, H22) |
| …among the 8 applicable-policy cases | 2 / 8 (H03, H22; both USPS) |
| Shopify or WooCommerce discount cases with a gold-cited URL | 0 / 14 |
| UPS shipping cases with a gold-cited URL | 1 / 5 (H08, UK support page) |

Discount queries returned neighbouring help pages (discount types, bundles, store credit, Scripts limitations, a WooCommerce feature request) instead of the discount-combination and coupon-management pages. UPS queries for US cases returned the Puerto Rico and Brazil versions of the dimensions page. Several cases share an identical query, because `searchBody` builds the query from platform or carrier, origin and region only, so their packages are identical.

## Primary endpoints

Case score = mean of 2 replicates; a missing output scores 0. Uncertainty is clustered by the 15 families: exact two-sided sign test on family-level mean differences, plus a family-cluster bootstrap 95% percentile interval (10,000 resamples, seed 20261029). Holm correction across the two co-primaries.

| Endpoint | Denominator | A | B | C | C − B | Cases C>B / C<B / tied | Family sign test | Bootstrap 95% | Holm p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 allowed-status rate, applicable-policy cases | 8 cases, 4 families, 16 outputs per model arm | 1.000 | 1.000 | 0.875 | −0.125 | 0 / 2 / 6 | 0+ / 1− / 3 tied, p = 1.00 | [−0.375, 0.000] | 1.00 |
| P2 clean-output rate, all cases | 24 cases, 15 families, 48 outputs per model arm | 1.000 | 1.000 | 1.000 | 0.000 | 0 / 0 / 24 | all 15 tied, p = 1.00 | [0.000, 0.000] | 1.00 |

- P1 cannot reach significance by design: with 4 families the smallest attainable sign-test p is 0.125.
- The two C losses on P1 are H03 replicate 1 and H22 replicate 2. Each had the gold-cited passage and answered `insufficient`, which the gold does not accept when the passage is present. The other replicate of each case answered `review`, citing the passages.
- Arm A scores 1.000 by construction. The custodian's gold accepts A's fixed `hold`/`insufficient` statuses in every case without evidence, so the status endpoint cannot separate A from a correct answer. A is a different method, so A versus B or C says nothing about retrieval.
- P2 forbidden-claim rate: 0 / 48 outputs in each of A, B and C (rules F1–F4). The blind audit found 2 more sentences that matched a pattern before the negation guard. Both were negated ("cannot be definitively applied", "cannot be validated against … realized savings"), so the audited count is also 0.

## Secondary endpoints (descriptive)

| Measure | A | B | C |
| --- | --- | --- | --- |
| Status counts (48 outputs) | hold 28, insufficient 20 | insufficient 48 | insufficient 45, review 3 |
| S1 `review` rate, 8 applicable cases | 0.000 | 0.000 | 0.125 (H03, H22, one replicate each) |
| S2 allowed-status rate, all 24 cases | 1.000 | 1.000 | 0.938 |
| Allowed-status rate on the 8 applicable cases, lenient evidence rule (any non-empty package counts as evidence) | 1.000 | 1.000 | 0.125 |
| Outputs citing ≥1 source | 0 | 0 | 48 / 48 |
| F1 review without citation / F2 invented URL / F3 savings or cause / F4 secret request | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| Cases with identical status in both replicates | 24 / 24 | 24 / 24 | 21 / 24 |

- S2 C−B = −0.0625 (cases 0 / 3 / 21; family sign test 0+ / 2−, p = 0.50; bootstrap [−0.152, 0.000]). The third loss is H09 replicate 1, a cited `review`. Under the URL rule its package counts as no-evidence, but it held a Shopify POS discount-combining page close to the gold's sources. This is where the URL proxy is weakest.
- The lenient-rule row shows how far C is from using its packages. If every package counted as evidence, the gold would expect `review` or `hold` on the applicable cases, and C gave `insufficient` in 14 of 16 outputs.
- The model never used `hold` in either arm. The SYSTEM prompt defines the four statuses only by name, and the model treated every gap as `insufficient`.

### Per stratum (allowed-status rate / clean rate / review rate; 4 cases each)

| Stratum | A | B | C |
| --- | --- | --- | --- |
| applicable-discount | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 |
| applicable-shipping | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 | 0.75 / 1.00 / 0.25 |
| missing-context | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 |
| exceptions | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 | 0.88 / 1.00 / 0.13 |
| conflicting-insufficient | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 |
| malicious-irrelevant | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 | 1.00 / 1.00 / 0.00 |

With 4 cases per stratum, these rates are descriptive.

## Exploratory analyses

**Case-specific forbidden claims and uncited policy facts (preregistered as optional).** A single AI rater (the benchmark agent) rated all 96 model outputs from the blind packet, with rules written down before reading them. Case-specific forbidden claims: B 0 / 48, C 1 / 48. The one C hit is borderline: in H05 replicate 2 the output reads the zero exposure and zero threshold as meaning "no active discount scenario". Uncited policy facts: 0 in both arms, because every B output declined to state any policy and every C output cited its sources. Blinding was labels-only: every C output cited sources and no B output did, so the rater could infer the arm from the citations.

**Post hoc, not preregistered.** In 18 of 48 C outputs, and 0 of 48 B outputs, the `nextCheck` field held only a date (e.g. `2026-01-01`) instead of a check. Two of the three C `review` outputs had a date-only `nextCheck`. Two C outputs labelled `review` also say in their rationale that the evidence is insufficient. The output schema accepts both, and neither is caught by the preregistered rules.

## Cost

| Provider | Usage | Reserved | Estimated charge |
| --- | --- | --- | --- |
| Tavily search (basic depth) | 24 requests, 24 credits (from response `usage`) | 480,000 micros | USD 0.192 at the published pay-as-you-go rate of USD 0.008/credit; the actual charge depends on the account's plan |
| Nebius, arm B | 48 requests, 19,076 input + 6,844 output tokens | 1,008,000 micros | about USD 0.0028 at an unverified rate |
| Nebius, arm C | 48 requests, 59,690 input + 11,243 output tokens | 1,008,000 micros | about USD 0.0063 at an unverified rate |
| Total | 120 HTTP requests | 2,496,000 of 3,000,000 micros | about USD 0.20 |

The Nebius estimate uses USD 0.06 / 0.24 per 1M input/output tokens, taken from a third-party estimator; the official price page was not machine-readable. The ledger records `actualCostMicros` as unknown for all 120 requests. Provider invoices were not reconciled and remain authoritative. Largest single model request: 1,672 input and 381 output tokens, well under the 16,000 / 1,600 reservation basis.

## Deviations from the preregistration and the brief

1. **Run location.** The brief asked for runs in mg-main. During setup, mg-main's HEAD moved from `0059778` to `e0153a4`, and the tree had uncommitted edits to `server/` and `scripts/` from the ongoing integration, so the runner's clean-checkout gate would have refused. Both paid phases ran from a fresh local clone at `C:\Users\liwen\Documents\Codex\2026-10-27\task\mg-bench-run`, detached at `e0153a4`. `scripts/benchmark/` is byte-identical between the two commits. This was recorded in the preregistration before any request. Private artifacts were then copied into mg-main's gitignored `benchmark-private/`.
2. **Prereg timestamp.** The preregistration says it was written at 03:15Z. The file was written and hashed at about 03:13Z, before the first search request at 03:13:40Z. The stated time is off by about two minutes. The ordering is unaffected.
3. **Search depth.** The brief mentions advanced search at 2 credits. The harness fixes `search_depth: basic` (1 credit). The run used the harness setting, and the reservation was sized as if for advanced search.
4. **Harness `score` command not used.** It needs two independent human raters per item, and there are none. Scoring used the preregistered `benchmark-private/score-mg.mjs` (SHA-256 `e8ff00cc…76de`), which computes all per-item flags from the blind packet before joining arm labels.
5. **Approval files.** The benchmark agent created the runner's approval JSON files on the lead agent's instruction. No human signed them.
6. **Post-hoc observation.** The date-only `nextCheck` count was added after unblinding and is labelled exploratory.

There were no retries, no reruns, no prompt or query changes, and no dropped cases. The two-hour time box was not reached.

## Limitations

- **AI-authored and AI-graded.** The cases are synthetic, and one AI custodian wrote both cases and gold. No domain reviewer checked them, and a second AI agent did all the scoring. The protocol calls for two human domain reviewers and two human raters. This run has none.
- **Small and clustered.** 24 cases in 15 families, and the primary status endpoint rests on 8 cases in 4 families. Even a perfect C advantage on P1 could not reach p < 0.125.
- **Evidence condition is a URL proxy.** A package counts as evidence only if it holds a URL the gold cites. A matching URL whose 3,000-character excerpt leaves out the rule still counts. A related page with a different URL does not (H09).
- **Mechanical forbidden-claim rules are coarse.** Regexes with a negation guard catch only explicit wording. Case-specific forbidden claims and required cautions were assessed only in the single-rater exploratory pass.
- **Schema ceiling.** Cases carry only platform, carrier, region, discount origin and three metrics. The model never sees a finding narrative, a service level or dimensions, and many outputs complain that no concrete finding was given.
- **Live retrieval depends on time.** Packages reflect Tavily's index on 2026-10-30 at 03:14 UTC. The harness query template, and not the case content, set what was retrieved; a rerun could return different pages.
- **Single model, single provider window.** One model with no pinned revision, run over about 100 seconds. Nothing here generalizes to other models or prompts.
- **Retrieval quality and model use are confounded.** Because only 2 of the 8 applicable cases received the operative passage, this run mostly measures retrieval coverage under the harness query template. It measures the model's use of the right evidence only on 4 outputs.

## Files

Public: `docs/benchmark/PREREGISTRATION.md`, `docs/benchmark/RESULTS.md`.

Private, gitignored, in `benchmark-private/`: `prereg.md`, `run.config.json`, `score-mg.mjs`, approvals and plans, `exploratory-rating-rules.md`, `exploratory-ratings-private.json`, and `final-run/` (hash-chained `requests.jsonl` ledger, `frozen-sources.json` raw retrievals, `results-private.json` model outputs, `blind-packet.json`, `blind-mapping-private.json`, `blind-seed-private.json`, `blind-scores-private.json`, `unblinded-results-private.json`). Ledger file SHA-256 `362ca7eafde4b6183af953f58d02f580245d600d18ad5d089b8abd1b68f59e87`.
