# Evidence-led visual revision

Purpose: make the decision change legible on the first screen without implying a live model discovery or recovered revenue.

Direction: a focused investigation desk. A deep blue case panel leads with the initial settings hypothesis and the different check suggested by a documented exception. The surrounding ledger remains quiet, with readable supporting text and tabular financial values. The visual sequence communicates a hypothesis change, not a measured financial outcome.

Tokens: ink #142d3b, case background #102e40, paper #ffffff, canvas #edf2f5, source highlight #f4cc81, secondary text #4c626d. System Segoe UI for controls/body; Cambria/Georgia for the case headline; tabular numeric figures for money. No external fonts or animation dependency.

Layout: left-aligned case headline and provenance above a two-column hypothesis/next-check comparison, followed by one explicit case button. Below it, the existing ledger, evidence rows and policy decision retain their contracts. On mobile the comparison and controls stack without page overflow.

Motion: a 150 ms transform-only nudge (no opacity fade) when the policy decision appears after user input. No counting money, looping decoration, automatic source searches or scroll listeners. A prefers-reduced-motion rule removes animation and transitions. Existing keyboard and focus behavior stays available.

Acceptance: homepage contrast and 320px layout; explicit synthetic/offline text; keyboard activation of the case; readable facts/assumptions/source/action change; reduced-motion computed styles; complete previous browser regressions and screenshot inspection. This is visual QA, not final benchmark or independent scoring.

References read without executing third-party code: https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md ; installed Vercel React Best Practices skill. No new software or persistent skill was installed.

## Judge-review revision (2026-10-29)

Story in ten seconds: a suggested margin fix is checked against official policy (Tavily); when the policy says the fix won't work, the next action changes with the same rows and dollars. Nemotron on Nebius drafts the cited check; code owns money and the decision.

- Mode: the header badge reads `/api/health` (`Live: Tavily + Nemotron`, partial `Live: Tavily · Nemotron off` / `Live: Nemotron · Tavily off`, or `Demo: saved results`). It never infers mode from the last response.
- Caveats: one non-dismissible banner per workspace (`DemoBanner`) plus at most one collapsed `Limits` disclosure per panel (`src/Limits.tsx`). Panels do not repeat "does not prove" lines. The CSV privacy line stays visible next to Import CSV.
- Words: primary UI says "on hold", "sources", "saved result/sample", "Suggested fix" / "Next check after policy". Engine codes (HOLD, REVIEW, MODEL_CLEAR) stay in exports and are shown as "On hold", "Review risk", "Clear in model". Jargon such as fingerprints lives only under "Advanced" disclosures. Server-provided notes and shared reason strings are displayed as-is.
- Sponsor actions: offline actions are the primary buttons ("Show saved policy result", "Draft offline checks", "Show sample proposal (offline)"). Live buttons and their consent checkboxes render only when health reports the provider configured; otherwise a one-line note says live calls run locally with your keys.
- Focus of attention: Findings → Policy evidence → Next check → Promo Preflight. CSV column mapping, the dataset fingerprint, the Policy-to-Test audit JSON and the same-cart comparison sit in keyboard-operable `<details>` labelled "Advanced: …".
