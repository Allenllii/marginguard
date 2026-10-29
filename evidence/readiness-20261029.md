# Local readiness and regression verification - 2026-10-29

Baseline local-merge-70b3af9bacac was checked against all 70 source-file hashes with no mismatch before changes. This run is implementation verification, not the requested final independent weighted review.

## Fixed and reproduced

Three new regressions failed before the fix and passed afterward:

- A direct provider-adapter invocation could bypass the service-layer context hold and still attempt a model request. The adapter now rejects unknown/wrong-region/insufficient policy context before catalogue or inference requests.
- Offline remediation selected the first returned search result even when another result supported the policy decision. It now selects a supporting passage; hold/insufficient decisions make no documented-policy assertion.
- The model received and could cite all returned sources, including passages not supporting the decision. Input and citation validation now use only the deterministic decision's supporting sources. Unsupported returned-result IDs fall back without live proof.

These are conservative structural/source-scope protections, not proof of semantic entailment. Policy applicability and prose fidelity still need real live-case human review. The default UI origin remains unknown; only the successful adapter-test fixture was made explicitly native to satisfy its intended context contract.

## Executed final checks

- ESLint, strict typecheck, frontend build, Worker generation/package and ESM validation: passed.
- 61 unit/API/build/migration tests: passed; zero failures/skips.
- 10 production Chrome browser scenarios: passed; zero failures, 9.5 seconds.
- 12/12 predeclared synthetic policy cases: passed. Golden fixture exact 3/3 issue amounts and row sets; clean control zero findings; dataset fingerprint 0aca9bee505e7050 unchanged.
- Production HTML, JavaScript, CSS and health: 200; correct MIME. Both provider modes fixture, runtime live flags and provider assertion false. Worker has 865,822 bytes and matches the packaged dist/server/index.js.
- Dependency lockfile did not change in this run. The last complete npm advisory check remains the October 28 executed zero-vulnerability result; no fresh advisory scan is claimed today.

Evidence: check-20261029.log, browser-results.json, production-20261029-smoke.json, evaluation.json and policy-fixture-evaluation.json. Mock provider tests are not actual NVIDIA/Nebius usage. No provider API call was made in this run.

## Remaining submission gates

Fresh public read confirms https://github.com/Allenllii/marginguard main is still commit 64ea74e216b8c7de50662c10ec43b86e743da9f3 with only LICENSE. Source upload and public demo deployment remain release actions, not completed by this local run. Real approved NVIDIA/Nebius inference proof, hosted migration/health, free judge access through December 15 and the parent's independent review remain open gates. The October 30, 17:00 UTC release freeze is unchanged.

No credential file was viewed, changed or transmitted. There were no uploads, public writes, card/payment/redemption actions, key creation/configuration, videos or final presentation work. Account-specific read-only details are kept outside the project tree and excluded from source packaging. A new local source ZIP is prepared for review only; it has no new Library identity or public URL.
