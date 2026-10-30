# Observed sponsor integration

## Policy retrieval v3: Search, then Extract (2026-10-30)

`server/tavily.ts` `research()` now runs two Tavily calls in the main policy flow.

1. **Search.** The query describes the seller's situation and asks for the governing rule without assuming the answer, for example `Shopify how do manually applied POS and draft order discounts interact with discount combination settings`. It uses advanced depth, `chunks_per_source: 3`, `max_results: 3` and `include_domains` restricted to the platform or carrier help domain. Results are screened for domain, injection text, retractions, region and duplicates; a `#fragment` URL of an accepted page counts as the same source.
2. **Extract.** One call reads the top two screened pages in full (`extract_depth: basic`, markdown, 10 s provider timeout, 15 s client timeout, 500 KB response bound, no retry). The page is split into complete sentences; a list item keeps its lead-in line, so "The following discount types always apply to an order, regardless of any combination settings:" stays attached to "Custom discounts that are manually applied to an order." Selection is deterministic: up to three sentences with the most context terms, in page order, at most 1200 characters. These sentences become the source passage that `decidePolicy` judges sentence by sentence. A page that fails, times out, is oversized, comes back under another URL or echoes the key keeps its search chunk, and the packet note names which sources are full-page sentences and which are chunks.

Each call is reserved against the live budget before it is sent (`service.ts` passes `reserveExtract`). If the Extract reservation is denied, the search result is returned and the note says Extract was not sent. Callers that pass no hook (operator scripts, the integration verifier) stay search-only.

The packet records provenance in `retrieval.steps` (operation, URL, request ID, credits, latency, outcome) alongside the existing `proof`. For the Shopify discount-combination pages, the SHA-256 of the reviewed operative sentences is stored; when a live Extract yields different sentences, the packet carries `policyChanged: { url, reviewedAt }` and the note asks for re-review while keeping the decision.

The hosted offline demo replays one recorded live Search + Extract run each for Shopify manual discounts, Shopify native discounts and USPS shipping, byte for byte, from `evidence/live-retrieval-v3-20261030.json`. That file is the call ledger: 4 searches (8 credits) and 4 Extract calls (reported 1 credit; documented worst case 4), 12 credits at most, all HTTP 200, no retries, no Nebius calls. One native run was superseded after a URL-mapping fix and is recorded as such. Other contexts show authored summaries labelled as such.

This is an operator integration record for one synthetic development case. It is not the final benchmark, an independent whole-project review, or a competition-readiness claim.

## What actually ran

On October 29, three manually initiated probes each had a hard limit of three HTTP attempts: Tavily search, authenticated Nebius model listing, and a completion from exactly `nvidia/Nemotron-3_5-Lightning`. Every request returned HTTP 200. No alternate model, automatic retry, private order data or customer identity was used. The three searches reported one Tavily credit each.

The first completion exhausted its output budget while producing hidden reasoning, with no final content. The corrected adapter used the exact documented Lightning chat-template control, without increasing the token limit. That second probe returned a validated response: request `ef742984d853d161234c3f9144d3e006`, 463 input tokens, 212 output tokens, zero reported reasoning tokens, and 1,677 ms observed for catalogue plus completion. Its Tavily request was `23b971f0-b9a0-45db-9628-ecb90de5d213`.

A third probe tested an additional prose-format candidate. It returned content but failed that candidate's new schema restrictions. Those experimental restrictions were withdrawn; the released adapter is the exact adapter source used by the successful second probe. The failed observations remain in the local reports and public proof summary. Future model responses can still fail validation and must continue to show an honest fallback.

## Why Tavily changes the check

The CSV identifies 28 kept orders above the seller's assumed discount ceiling, with $658.08 of synthetic exposure. The ceiling is a seller assumption. It is not a Shopify requirement or a realized recovery estimate.

For seller-provided manual-discount context, Tavily returned the official [Shopify POS discount-combination policy](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/discount-management/combining-discounts). Its manual-discount exception changes a generic combination-settings suggestion into a staff/manual-override audit. The conservative decision remains code-owned; the model cites a supporting source and drafts a next check and uncertainty. Transaction scope, store/plan eligibility and effective policy date still need verification. The source does not prove the anomaly's cause or guarantee savings.

## Request and evidence boundaries

- The verifier is separate from the public app and from the final benchmark. Importing its pure use-case module opens no files, reads no environment and calls no provider.
- The explicit CLI requires approved enabled credentials and a configured NVIDIA model. Each run uses a new UUID directory with exclusive checkpoint writes; historical proofs are not overwritten.
- A request reservation is saved before dispatch. Responses, unknown outcomes, requested controls and bounded usage/schema diagnostics are recorded. Raw arbitrary errors, model reasoning, headers and credential values are excluded.
- `evidence/live-integration-proof.json` is a public summary, with hashes of the complete local reports. Long retrieved passages and copied model policy prose are omitted rather than presented as a fresh paraphrase.
- A source-ID membership check is structural. It does not establish semantic support. The accepted response copied a long source passage and included an unfinished trailing clause; concise policy synthesis remains an explicit quality-review item.
- The first truncated probe did not retain its token usage. Its token count and the total model invoice charge are unknown. Later bounded usage values are observed, not inferred from the requested maximum.

## Model controls and references

The released adapter requests `store:false`. For the exact hosted Lightning identifier it also requests `chat_template_kwargs.enable_thinking=false`; unknown NVIDIA deployment identifiers receive no guessed template options. Existing money, citation, unsupported-number and causal-claim checks remain unchanged.

Primary references: [Nebius completion API](https://docs.tokenfactory.nebius.com/api-reference/inference/create-chat-completion), [Nebius' hosted Lightning request profile](https://github.com/nebius/nebius-physical-ai/blob/main/npa/src/npa/clients/token_factory.py), and [NVIDIA's Lightning model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-BF16). The request identifier is still checked in authenticated `/models` before each completion.

## Remaining release gates

Public hosted credentials were not configured. Provider-side monetary caps have not been verified; the public-live guard stays closed. A current browser-triggered live NVIDIA journey, public deployment/migration health, free judge access, fresh independent weighted review and fixes, and the final frozen benchmark remain open. Video and submission work follow those gates.
