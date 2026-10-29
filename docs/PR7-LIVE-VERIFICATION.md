# Actual PR7 prompt and grammar-guard verification

One manually initiated synthetic local-browser probe ran on October 29, 2026 against source commit `373d7616511cfcd6811637734b9be73d4026b2e8`. It had a hard limit of three actual provider HTTP attempts, no automatic retry and no alternate model/provider. All three returned HTTP success; the completion also passed the policy/output validators.

- Tavily search: `8df2a245-7576-48d3-9d40-ffb7b7213991`; one reported credit; observed 1,851 ms.
- NVIDIA model: `nvidia/Nemotron-3_5-Lightning`, verified in the authenticated catalogue before completion.
- Completion: `196038cb42e7180cb4fb6c1b30977819`; 579 input, 99 output and zero reported reasoning tokens; observed 2,164 ms including catalogue and validation.
- Browser checks: displayed cited scope/model draft, exported live provenance, held unknown origin and cleared results on reset; no page errors observed.

The returned prose did not exhibit the earlier singular/plural account mismatch, long copied passage or dangling clause. The model's proposed check was less specific than the code-owned manual-override check, which remains authoritative in the UI. This one accepted response does not establish general grammar quality or semantic fidelity. Independent review remains pending.

The official [model catalogue](https://tokenfactory.nebius.com/models/catalog/text2text/nvidia%2FNemotron-3_5-Lightning) was observed showing input at USD 0.06 per million tokens and output at USD 0.24 per million. The completion-only list-rate estimate is `(579 × 0.06 + 99 × 0.24) / 1,000,000 = USD 0.0000585`. This assumes all input is uncached and excludes taxes, discounts and other charges. The actual invoice amount was not verified. Tavily's reported credit use is not a confirmed fiat charge.

`evidence/pr7-live-journey-20261029.json` preserves the sanitized observation, actual request traces, usage, source/report hashes and estimate assumptions. No failure occurred in this new single probe; earlier failed development probes remain in their separate historical records. Subsequent navigation/deployment-preparation changes require their own offline regressions and are not attributed to this earlier live run.

No hosted secret, public deployment, final benchmark or video was performed. Runtime success is one release gate, not a claim of competition readiness.
