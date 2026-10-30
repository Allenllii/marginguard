# MarginGuard — Devpost submission text

Paste-ready English copy for the Devpost form. Track: **Best Apps and Agents**. Bonus prize: **Best Use of Tavily**.

## Tagline

Check the fix before you ship it: MarginGuard tests AI margin advice against live official policy.

## Inspiration

Small online sellers get margin alerts and generic advice ("tighten your discount combination settings"). On Shopify that advice is sometimes wrong: manual POS and draft-order discounts apply regardless of combination settings, so the toggle changes nothing and the leak continues. An assistant that sounds confident but ignores the platform's own rules costs money. We wanted an agent that treats official policy as a test the proposed fix has to pass.

## What it does

1. **Finds the leak with exact math.** Import an order CSV. Deterministic code computes contribution in integer cents and flags discount stacking, shipping overruns and return spikes. Every finding shows its formula and source rows; seller assumptions (discount ceiling, shipping allowance) are editable.
2. **Challenges the proposed fix with live policy.** For the flagged issue, MarginGuard asks Tavily for official documentation scoped to the seller's platform and context (domain-restricted to help.shopify.com, woocommerce.com, usps.com or ups.com). A rule engine checks whether the retrieved passage applies. In the demo case, the passage "custom discounts that you apply manually in Shopify POS always apply to the order, even if other discounts have combination restrictions" rebuts the settings fix and redirects the next check to auditing staff/manual overrides — same 28 rows, same $658.08 modeled exposure, different action.
3. **Holds when evidence is missing.** Unknown discount origin, the wrong region, an ordinary app mistaken for the Scripts API, or conflicting passages put the recommendation on HOLD instead of guessing.
4. **Drafts a cited check with NVIDIA Nemotron on Nebius Token Factory.** Nemotron writes the policy constraint, hypothesis, validation step and uncertainty from aggregate metrics and the retrieved passages. Code validates every citation and refuses drafts that change money or upgrade a HOLD.
5. **Tests a promotion before launch.** Promo Preflight exhaustively evaluates seller-authored promotion rules in integer cents, shows the worst-case cart, and compares the same cart under the original and a reviewed alternative rule.
6. **Exports an audit.** Findings, assumptions, sources, decision status and what would disprove the hypothesis export as a report.

## How we built it

- **Tavily Search** retrieves official policy with fixed, generic queries (never order data), `include_domains` restricted to the platform's official domain, and up to three sources. Results are screened for domain, relevance, prompt-injection text, retractions and regional scope before a passage is selected. In Promo Preflight, **Tavily Extract** pulls the full reviewed source page before rules are proposed.
- **Nebius Token Factory** serves `nvidia/Nemotron-3_5-Lightning` through its OpenAI-compatible API, with model discovery (`GET /v1/models`) before each draft. Inputs are bounded to aggregate metrics and short cited passages; output is schema-validated.
- **Deterministic core** (TypeScript, shared by an Express server and a Cloudflare-style Worker build): integer-cent arithmetic, policy applicability rules, request budgets (per-minute, daily and lifetime caps per provider), and same-origin JSON APIs. The model never computes money or decides eligibility.
- React + Vite front end with keyboard support, 320px layouts and reduced-motion handling.

## Challenges we ran into

Real retrieval is messier than fixtures: snippets truncate mid-sentence, two URLs return the same passage, and an early structured-output contract truncated model JSON. We bounded output, simplified the draft schema, de-duplicated sources and made every failure visible instead of silently falling back.

## Accomplishments we're proud of

Retrieval changes the decision, not just the citations list. The same live Tavily passage that redirects the manual-discount case leaves an unknown-origin case on HOLD.

## What we learned

The valuable part of an AI margin assistant is knowing when the recommended fix doesn't apply. Keeping arithmetic and eligibility in code made the model's job smaller and its output checkable.

## What's next

Read discount origin directly from a connected store instead of asking the seller, cover more platform policies, and run the pre-registered retrieval benchmark with human blind review.

## Built with

TypeScript, React, Vite, Node.js, Express, Zod, Tavily Search API, Tavily Extract API, Nebius Token Factory, NVIDIA Nemotron, Playwright.

## Try it

- Public demo (synthetic data, no account): see README for the current URL. The hosted demo runs offline: it replays a recorded live Tavily + Nemotron run and makes no provider calls, so judges need no keys.
- Live mode: clone the repo, add your own `TAVILY_API_KEY` and `NEBIUS_API_KEY`, set the two enable flags, `npm run dev`. See README.

## Data and limits

All demo orders are synthetic. Modeled exposure is a review candidate, not realized savings. MarginGuard does not connect to a store or change settings.

## Feedback on Nebius Token Factory and NVIDIA models

- The OpenAI-compatible endpoint made integration a drop-in; `GET /v1/models` let us verify the exact NVIDIA model ID at runtime instead of hard-coding a guess.
- Nemotron-3.5-Lightning returned short structured drafts in about one second (579 input / 100 output tokens in our run), fast enough to sit inside an interactive click.
- Model IDs mix conventions (`Nemotron-3_5-Lightning`, `nemotron-3-super-120b-a12b`, `NVIDIA-Nemotron-3-Nano-30B-A3B`); a stable alias per family would reduce configuration errors.
- Early on, long JSON outputs truncated at the token limit without a clear finish-reason signal in our parsing path; documenting recommended max-token settings for structured output per model would help.
- Per-request cost is not returned in the response; returning usage cost (or a link to it) would make budget enforcement in apps easier.

## Project timing

MarginGuard was created during the Submission Period (repository started 2026-10-29).
