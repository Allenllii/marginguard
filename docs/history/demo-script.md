# MarginGuard demo — 150 seconds

The local review draft is an actual UI recording with synthetic data, saved-source fixtures, offline guidance, English synthetic narration, and a persistent fixture label. It is not final live API evidence and is not approved for public upload. A separate genuine Tavily request is recorded in `evidence/tavily-live-proof.json`; NVIDIA inference remains pending.

| Time | UI action and narration purpose |
| --- | --- |
| 0:00–0:15 | Problem: a margin alert needs an applicable next check, not an automatic settings change. Overview; synthetic label visible. |
| 0:15–0:35 | Import the reproducible 504-order CSV. Explain that the later manual-origin context is invented seller input, not detected or obtained from a Shopify integration. |
| 0:35–0:55 | Open the **discount** finding. Show rows, cent-based formula, editable seller ceiling, and $658.08 default modeled exposure. The 20% ceiling is a seller assumption, not platform policy or realized savings. |
| 0:55–1:35 | Choose Shopify/manual/POS/draft context. Retrieve policy in the final live version; the current draft previews labeled saved-source fixtures. Show the manual-discount exception and the decision redirect: a settings-toggle hypothesis is contradicted; audit manual overrides, permissions, and intent. Verify plan/transaction/effective-date applicability and keep cause unproven. |
| 1:35–1:55 | Final live version: request a real NVIDIA/Nebius cited synthesis and show actual provenance. Current draft: generate clearly labeled offline checks and state that no model was called. No fabricated request IDs, latency, token usage, or AI success. |
| 1:55–2:15 | Set origin to unknown. Show **Hold**, ask for the originating discount record, then export facts, assumptions, policy constraint, next check, and disconfirming evidence. No store modifications execute. |
| 2:15–2:30 | Show observed local test/evaluation evidence. Twelve predeclared synthetic routing cases are regression checks, not measured real-world accuracy. Distinguish actual successful provider calls and pending semantic review. |

The before/after value is concrete: **generic combination-settings check → source-conditioned manual-override audit**. A policy can redirect investigation without proving the cause of a store's losses. Shipping remains a secondary fallback; returns do not occupy the opening demonstration.

Reproduce the local draft with `npm run record:demo` while the local app runs. The script blocks all `live:true` API requests. On Windows, optional `scripts/synthesize-narration.ps1` uses the built-in English speech engine; `python scripts/render-demo.py` muxes the resulting narration. Inspect the video, manifest, and duration before delivery.

For the final competition recording, use actual successful Tavily and NVIDIA calls only after their approvals. Keep the genuine source passage and applicability constraints visible, preserve any failure/hold state honestly, remain under three minutes, and obtain review before a public video upload. Record its exact version/hash in `RELEASE.md` before the October 30, 17:00 UTC freeze.
