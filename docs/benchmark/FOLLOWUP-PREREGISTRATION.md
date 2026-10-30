# MarginGuard holdout benchmark, follow-up: preregistration

Written 2026-10-30 04:10–04:15 UTC (2026-10-29 21:10 PT), before any provider request for this follow-up. It contains no gold content and no case answers. The private copy is `benchmark-private/followup-prereg.md` in mg-main.

## What kind of test this is

This is a **follow-up after a product change, not a confirmatory test**. The first run (`docs/benchmark/PREREGISTRATION.md`, `docs/benchmark/RESULTS.md`) found that the frozen Tavily package did not improve Nemotron's decisions, mainly because the harness's fixed basic query put a gold-cited page in the package for only 4 of 24 cases. The product's retrieval was then rebuilt (main `d1d3414`: neutral queries, Tavily advanced Search with chunks, Tavily Extract of the top two screened official pages, operative full-sentence selection). That change was made after the first result was known, by people who had seen it. The first run stays reported as it is and is not replaced by this one.

Every role is filled by an AI agent: the cases and gold were written by an independent AI custodian; this preregistration, the run and the scoring are done by a benchmark agent (Claude, Opus 5.5 subagent) on instruction from the lead agent. No human reviewed the gold, the rubric or this file.

## Questions

1. **P0 (primary, objective).** With the product's current retrieval pipeline, for how many of the 24 holdout cases does the package contain a gold-cited page?
2. **P1/P2.** Does the same model, given that package (arm C'), do better than the same model with an empty package (arm B), on the first run's preregistered endpoints?

## Frozen inputs

| Item | Value |
| --- | --- |
| Product commit | `d1d341434f72e580eb00128d572e1255ddb8fe79` (origin/main), fresh clone `C:\Users\liwen\Documents\Codex\2026-10-27\task\mg-bench-v3`, detached, clean; `node_modules` is a junction to mg-main's. No product file is edited. |
| `server/tavily.ts` / `server/http.ts` / `shared/policy-source-scope.ts` | `167c00c0…9614` / `0d61fd34…4f4d` / `75902997…e1d7` (SHA-256) |
| Harness modules used (unchanged, byte-identical to the first run) | `core.mjs` `7ec2e9df…94a8`, `ledger.mjs` `aa1d3ad7…c956`, `transport.mjs` `b36d2a6c…fe04`, `blind.mjs` `603f1e4e…5262` |
| Dataset `mg-final-holdout-v1` (same as first run) | canonical `ba28b3df0002b1acc2c8bfca49c349a3bba1c8425f9680aebf99e99bdf516fdd`; file `61ed6bed2fca2b291b317e22a2e58e9ffa8e8c8568f914b52960aa3620aae4f7` |
| Gold (unchanged, private) | `gold.json` `b6eb49580d09b977394bba7fd5471ef78dc43fcda1f24c6ee22ced7c44828bd9`; `custody.md` `451b3a66d78269ad3126efd43a7f1b70b7b9f7d2f048bbe7c21a3466d6662847` |
| Scorer (unchanged) | `benchmark-private/score-mg.mjs` `e8ff00cc3693b6879c0a1de103d0554af5325bd25a7c75b9767502dfe83676de` |
| Follow-up adapter scripts (private, `benchmark-private/followup/`) | `collect.mjs` `6dd65f4e82c6284d529424f3dce232b3f4bcbb504797704c5fd8dd51be3882a3`; `infer.mjs` `6730766039798f99ba2fa6979d555bb6f510d670508e3e396b40b8e2f16faf22`; `coverage.mjs` `646e19c1ed968906a04a301330989ba14390e26145c0fc99cef83dab20b265c2` |
| Run directory | `benchmark-private/followup-run/` |

The inference plan hash depends on the retrieved packages, so it is recorded after collection and before the first model request (`followup-run/inference-plan.json`, and the results).

## Retrieval (arm C' package)

One call of the product's `research(kind, context, live = true, {key, enabled: true}, meteredFetch, { reserveExtract })` per case, in case order H01–H24, no caching between cases (identical queries are searched again).

- **Mapping from case to product input.** `kind` = the case's `kind`; `context` = the case's `context` verbatim (`platform`, `carrier`, `region`, `discountOrigin`). The product schema accepts every value in the dataset, including `app`, `app-script`, `scripts-api` and `unknown` origins, so no field is remapped. What the product does with them is the product's behaviour and is measured as is: the discount query uses platform and origin (`app` and `app-script` share one query; `native` and `unknown` share another), the shipping query uses only the carrier and is fixed to the United States.
- **Non-US cases.** For region `UK` or `unknown` (8 cases: H06, H08, H12, H15, H19, H20, H23, H24) the product holds without searching. These are recorded as **empty packages**, stay in every denominator and count as "no gold page" for P0. For them C' gets the same input as B. Two of the 8 applicable-policy cases (H15, H23) are among them.
- **Calls.** Per US case: one advanced Search (`chunks_per_source` 3, `max_results` 3, domain-restricted), then, if Search keeps at least one screened source, one Extract call (basic depth) for the top two sources, granted by `reserveExtract`. At most 16 Search and 16 Extract calls.
- **Ledger.** `meteredFetch` wraps the product's request function. Before each Tavily call it appends a fsynced, hash-chained `reserved` record (request ID, case, op, request hash, reservation); after it, a `completed`/`failed`/`unknown` record (HTTP status, provider request ID, credits from the response `usage`, response hash). Provider payloads are not in the ledger; result URLs, titles and scores (no page text) are kept privately for diagnosis. No retries. An `unknown` outcome (network loss, timeout, unreadable body) stops all further Tavily dispatch; remaining cases are not attempted and inference is then not run, as in the first run. An HTTP error or a product-side failure yields whatever packet the product returns (empty) and is kept.
- **Model input from the product packet.** Each product source becomes `{id, url, title, text}` (the first run's source shape): `id` and `title` as the product gives them, `text` = the product's `snippet` (≤1,200 characters: Extract operative sentences, or the Search chunk when Extract gave none), `url` with query and `#fragment` stripped exactly as the harness's `extractSearchSources` does. The product's `sourceRegion`, `publishedDate`, note and steps are not passed, and the product's own `decidePolicy` is not evaluated. Packages are frozen in `followup-run/frozen-sources.json` before any model request.

## Arms and model parameters

- **A**: harness `deterministicBaseline`, descriptive only.
- **B**: empty package. **C'**: product package. B and C' are both run fresh in one window; the first run's B outputs are not reused.
- Model, endpoint, SYSTEM prompt, output schema, `temperature` 0.2, `max_tokens` 1600, `json_object`, `enable_thinking=false`, `store:false`, 45 s timeout: identical to the first run. The body is built by a copy of `buildModelBody` whose only change is the source hostname check: it accepts the product's official domain and its subdomains (for example `faq.usps.com`), where the harness accepts three exact hostnames. Whenever the harness check accepts a package, the body is asserted byte-identical (canonical hash) to `buildModelBody`'s; every B body is asserted identical to the first run's B body hash.
- 2 replicates per arm per case, 96 model requests, the same counterbalanced order as `makePlan` (case index i, replicate r: B then C' when i + r is odd, else C' then B). The request order is asserted identical to the first run's plan.
- Stop rule as in the first run: no retries, no reruns, no prompt changes, no case drops; the first `unknown` outcome stops all further dispatch, and requests not attempted are missing and score 0; a `failed` request leaves a missing output and the run continues.

## Budget

- ≤ 24 Search + ≤ 24 Extract Tavily calls (48 retrieval HTTP), ≤ 96 model calls, ≤ 144 HTTP in total (cap 150), reservation ≤ USD 3.00.
- Tavily credits (docs.tavily.com/documentation/api-credits, read 2026-10-30 04:08 UTC): advanced Search 2 credits per request; basic Extract 1 credit per 5 successful URL extractions, failed URLs not charged; pay-as-you-go USD 0.008 per credit. Reservations: Search 20,000 micros (2 credits + 25%), Extract 10,000 micros (1 credit + 25%). At most 16 + 16 calls: 480,000 micros.
- Model: 21,000 micros per request, same basis as the first run (unverified Nebius price, so a large margin). 96 × 21,000 = 2,016,000 micros. The harness ledger for inference gets a reservation cap of 3,000,000 minus what retrieval reserved.
- Reported cost: Tavily credits from response `usage`; model tokens from `usage`; USD for the model is an estimate at the unverified third-party price used in the first run. Missing usage stays unknown. Invoices are not reconciled.

## Endpoints

**P0, retrieval coverage (primary).** Number of the 24 cases whose frozen package contains at least one gold-cited URL under the first run's rule: lowercase, drop leading `www.`, drop query, `#fragment` and trailing slash, compare host + path (`normUrl` in `score-mg.mjs`). This rule is already page-level and ignores fragments. Also reported: a **strict** variant comparing the whole product URL string, `#fragment` and query included (only lowercased, trailing slash dropped); counts among the 16 US cases and the 8 applicable-policy cases; and the number of distinct families covered. The first run's value under the same code is 4 / 24. P0 is descriptive: one retrieval per case, no test. Descriptive diagnostics: whether a gold page appeared in the raw Search results before product screening, and Extract success per case.

**P1, P2 and secondaries: definitions as in the first run, unchanged.** Unit = case-replicate output; case score = mean of 2 replicates; missing or invalid = 0.

- P1 allowed-status rate on the 8 applicable-policy cases (4 families). C' uses the gold `withEvidence` set for a case iff its package contains a gold-cited URL under the P0 rule; A and B always use `withoutEvidence`. Lenient sensitivity: any non-empty package counts as evidence.
- P2 clean-output rate on all 24 cases, mechanical rules F1–F4 as in the first run (F2 for C' flags only URLs not in that case's package).
- Contrast C' − B, paired within case; exact two-sided family sign test (zero-difference families dropped); family-cluster bootstrap 95% interval (10,000 resamples, mulberry32 seed 20261029); Holm across P1 and P2 at α = 0.05. P1 cannot reach p < 0.125 with 4 families, and is reported descriptively with its interval.
- Secondaries as in the first run: S1 `review` rate on applicable cases, S2 allowed-status on all 24, per-stratum rates, status counts, F1–F4 counts, citation counts, replicate agreement, missing/invalid counts. Also descriptive: follow-up B against first-run B (same bodies, different time) as a check of run-to-run stability.

## Scoring and blinding

`infer.mjs` builds the harness's labels-blind packet (`createBlindPacket`, private random seed). `score-mg.mjs blind` computes every per-item flag from the packet and the frozen packages only; the benchmark agent reads every F2–F4 hit in the blind audit before unblinding, as in the first run; then `score-mg.mjs unblind` joins arm labels. Inside the harness, ledger and scorer, arm C' carries the label `C` (the code accepts only A/B/C); nothing else in the scorer changes. `frozen-sources.json` uses the first run's packet fields that the scorer reads (`caseId`, `outcome`, `sources[].url`). Blinding is labels-only: citations reveal a non-empty package.

## Reporting

`docs/benchmark/FOLLOWUP-RESULTS.md`: coverage first run vs follow-up with denominators, P1/P2 for A/B/C', family-clustered uncertainty, cost, deviations and limitations, whatever the result. No tuning and rerun. Raw retrievals, model outputs, gold, mapping and seed stay in `benchmark-private/`. Time box about two hours from this file.
