# MarginGuard — Devpost submission text

Paste-ready English copy for the Devpost form. Track: **Best Apps and Agents**. Bonus prize: **Best Use of Tavily**.

## Tagline

Check the fix before you ship it: MarginGuard tests AI margin advice against live official policy.

## Inspiration

Small online sellers get margin alerts and generic advice ("tighten your discount combination settings"). On Shopify that advice is sometimes wrong: custom discounts that staff apply manually in POS or on a draft order apply regardless of combination settings, so the toggle changes nothing and the leak continues. An assistant that sounds confident but ignores the platform's own rules costs money. We wanted an agent that treats official policy as a test the proposed fix has to pass.

## What it does

1. **Finds the leak with exact math.** Import an order CSV. Deterministic code computes contribution in integer cents and flags discount stacking, shipping overruns and return spikes. Every finding shows its formula and source rows; seller assumptions (discount ceiling, shipping allowance) are editable.
2. **Challenges the proposed fix with live policy.** For the flagged issue, MarginGuard sends Tavily Search a neutral query for the seller's platform and context, domain-restricted to help.shopify.com, woocommerce.com, usps.com or ups.com, then Tavily Extract pulls the official page so the rule engine reads full sentences. On the Shopify discount-combination pages we reviewed, the result also says if the page has changed since our review. The rule engine checks whether the text applies. In the demo case, the passage "custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions" rebuts the settings fix and redirects the next check to auditing staff/manual overrides — same 28 rows, same $658.08 modeled exposure, different action.
3. **Holds when context is missing.** An unknown discount origin, a non-US region, an app whose discount mechanism is unknown, or Shopify Scripts (retired by Shopify on 2026-06-30) puts the recommendation on HOLD whatever the sources say. A retracted or contrary passage also holds; no passage, or conflicting passages, return "not enough evidence".
4. **Drafts a cited check with NVIDIA Nemotron on Nebius Token Factory.** Code supplies the policy statement behind each citation; Nemotron-3.5-Lightning writes the hypothesis, the validation step and the uncertainty from aggregate figures and the retrieved passages. Code checks every citation and rejects numbers in the prose; a held case never reaches the model.
5. **Tests a promotion before launch.** In Promo Preflight the seller describes a campaign in plain English; Nemotron 3 Super turns it into rules, code checks them, the seller confirms, and an integer-cent simulator evaluates every basket, shows the worst-case cart and compares it under the original and a reviewed alternative rule.
6. **Exports an audit.** Findings, assumptions, sources, decision status and what would disprove the hypothesis export as a report.

## How we built it

- **Tavily Search** retrieves official policy with fixed, neutral queries (never order data), `include_domains` restricted to the platform's official domain, and up to three sources. Results are screened for domain, relevance, prompt-injection text, retractions and regional scope.
- **Tavily Extract** then pulls the top official page, so the decision reads full sentences; on the reviewed Shopify discount-combination pages, a changed page is flagged against our reviewed copy. The hosted demo replays recorded Search + Extract responses for the manual, automatic/code and USPS cases. In Promo Preflight, Extract pulls the reviewed policy page before rules are proposed.
- **Nebius Token Factory** serves two NVIDIA models through its OpenAI-compatible API, each checked with `GET /v1/models` before the call:
  - **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`) turns free-form campaign text into promotion rules. Code then grounds every value in a number the seller wrote, cross-checks the rules against a local grammar parser where it can read the text, and holds on any disagreement; the seller confirms before simulation.
  - **Nemotron-3.5-Lightning** (`nvidia/Nemotron-3_5-Lightning`) drafts the cited policy check in about a second. Inputs are bounded to aggregate figures and short cited passages; output is schema-validated and may not contain numbers. It can also write the optional analyst brief, which code validates the same way and replaces with offline guidance when it fails; the one live brief we recorded failed the no-digits check and fell back.
- **Deterministic core** (TypeScript, shared by an Express server and a Cloudflare-style Worker build): integer-cent arithmetic, policy applicability rules, request budgets (per-minute, daily and lifetime caps per provider), and same-origin JSON APIs. The model never computes money or decides eligibility.
- React + Vite front end with keyboard support, 320px layouts and reduced-motion handling.

## Challenges we ran into

Real retrieval is messier than fixtures: snippets truncate mid-sentence, two URLs return the same passage, and an early structured-output contract truncated model JSON. We bounded output, simplified the draft schema, de-duplicated sources and made every failure visible instead of silently falling back. Our own benchmark was a negative result: on 24 holdout cases the Tavily package did not improve Nemotron's decisions, mostly because the fixed query found the page the answer depends on in only 4 cases. That is why the policy check now uses neutral queries and Extract.

## Accomplishments we're proud of

Retrieval changes the decision, not just the citations list. For Shopify discounts, the recorded live retrieval for manual/POS discounts rebuts the settings fix and turns the next check into an override audit, while the recorded retrieval for automatic/code discounts keeps the settings fix as a review candidate. USPS shipping reaches review only on cited passages that state a pricing mechanism (dimensional weight, a noncompliance fee). An unknown origin, an app origin or retired Shopify Scripts holds regardless of the sources.

## What we learned

The valuable part of an AI margin assistant is knowing when the recommended fix doesn't apply. Keeping arithmetic and eligibility in code made the model's job smaller and its output checkable.

## What's next

Read discount origin directly from a connected store instead of asking the seller, cover more platform policies, and re-run the pre-registered benchmark on the Search → Extract design with human blind review.

## Built with

TypeScript, React, Vite, Node.js, Express, Zod, Tavily Search API, Tavily Extract API, Nebius Token Factory, NVIDIA Nemotron, Playwright.

## Try it

- Live demo (synthetic data, no account, no keys): https://marginguard.marginguard-demo.workers.dev . It makes real Tavily Search + Extract and Nemotron calls on Cloudflare Workers, capped per provider at 4/minute, 20/day and 100 in total (durable D1 ledger) through December 24, 2026.
- Offline mirror: https://allenllii.github.io/marginguard/ replays recorded live runs with no provider calls, if the live budget is used up.
- Live mode: clone the repo, add your own `TAVILY_API_KEY` and `NEBIUS_API_KEY`, set the two enable flags, `npm run dev`. See README.

## Data and limits

All demo orders are synthetic. Modeled exposure is a review candidate, not realized savings. MarginGuard does not connect to a store or change settings.

## Feedback on Nebius Token Factory and NVIDIA models

Each point is something we hit while building, the effect it had, and what would help.

- **Structured output was the single biggest reliability fix.** With `response_format: json_object`, Nemotron-3.5-Lightning drafts failed our validator in 3 of 5 live end-to-end runs (citations returned as bare strings, a next step that repeated the rebutted fix). Switching to `json_schema` with `strict: true` and an `enum` of allowed source IDs made the next runs pass on the first call. *Suggestion:* state per model, on the model card, whether `json_schema` strict mode is supported and which JSON Schema keywords are honoured (`enum`, `minItems`, `maxLength`).
- **`GET /v1/models` made runtime verification easy.** We check the exact NVIDIA model ID before every call and never silently substitute another model. *Suggestion:* model IDs mix conventions (`Nemotron-3_5-Lightning`, `nemotron-3-super-120b-a12b`, `NVIDIA-Nemotron-3-Nano-30B-A3B`); stable per-family aliases (for example `nvidia/nemotron-fast`, `nvidia/nemotron-reasoning`) would prevent configuration errors.
- **Routing fast and reasoning models worked as the track suggests.** Lightning answers short structured drafts in about a second; Nemotron 3 Super turns free-form campaign text into rules in about ten seconds and spent most of its output on reasoning (one call: 1,018 output tokens, 899 of them reasoning). *Suggestion:* a documented way to cap reasoning tokens separately from answer tokens would make latency and cost predictable for interactive apps.
- **Cost is not in the response.** Usage tokens are returned, but not price, so our budget ledger can only record tokens and mark the dollar amount unknown. *Suggestion:* return the per-request charge (or a pricing version) next to `usage`.
- **Prompt rules about digits were not reliable without validation.** A Lightning brief put dollar amounts in prose despite a "no digits" instruction; our validator caught it. We now send that prompt no numbers at all (not yet re-run live). *Suggestion:* an example in the docs of combining structured output with server-side validation would help others avoid trusting prompt-only constraints.
- **The OpenAI-compatible API ran unchanged on Cloudflare Workers** once we replaced `fetch(..., { redirect: 'error' })`, which Workers reject, with `redirect: 'manual'` plus a 3xx check. A note in the Token Factory quickstart for edge runtimes would save others that debugging.

## Feedback on Tavily

- **Fragment URLs return duplicate results.** One Shopify query returned `…/discount-combinations`, `…#eligibility-requirements` and `…#manage-combinations` with identical content (request `ef540bad…`); with `max_results: 3` that left one distinct page. *Suggestion:* collapse `#fragment` variants by default or offer a "distinct pages" option.
- **Different URLs can share one passage.** Two Shopify URLs returned the same snippet in two searches (`19444728…`, `8f7b9603…`); we now de-duplicate by text.
- **Domain restriction cannot pin a locale.** In our benchmark, US UPS queries restricted to `ups.com` returned the Puerto Rico and Brazil versions of the same page. *Suggestion:* a country or path filter alongside `include_domains` (for example `/us/en/`).
- **`chunks_per_source` needs advanced depth.** Getting the operative sentence took advanced search (2 credits, 2.2–5.5 s) versus basic (1 credit, about 1.5 s). A repeated query answered in 163 ms looked cached but was still billed 2 credits. *Suggestion:* a cheaper "best chunk per result" mode, or reduced pricing for cache hits.
- **Extract credits were hard to reconcile per call.** One-URL Extract calls reported 0 credits and two-URL calls 0 or 1. *Suggestion:* report the fractional charge per call so apps can enforce budgets exactly.
- **Freshness signals would make policy monitoring first-class.** We detect changed policy pages by hashing the operative sentences Extract returns. *Suggestion:* return a content hash or last-modified time with Extract results, so apps can watch pages without re-reading them.
- **What worked well:** `include_domains` in restrict mode kept every result on the official domain; Search followed by Extract gave us complete sentences to decide on; and the request ID plus credit usage in each response made our provenance ledger straightforward.

## Project timing

The repository was created on 2026-10-27 (first commit `64ea74e`, LICENSE only), and the first project code was committed on 2026-10-29. The Submission Period began on 2026-08-26, so MarginGuard was created entirely within it.
