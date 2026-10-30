# Policy-to-Test local audit export

Based on main `70759199ea11395284e952bfc37054f48c19edf1`. This increment adds a downloadable, self-contained JSON snapshot to the existing Policy-to-Test panel. It does not change matching or verdict semantics, connect a store, or make provider requests.

## Review the result

Open the offline discount counterexample, then choose **Download Policy-to-Test audit (JSON)** beneath the three cards. The file includes:

- The current proposed action and all three assumed discount-origin scenarios: judgment, reason, explicit HOLD reason, next check, outstanding evidence and accepted source matches.
- Dataset SHA-256 **prefix**, synthetic flag, USD currency, seller assumptions, finding ID, CSV row numbers, formula and modeled exposure in integer cents. Raw CSV, order records, product labels and filenames are outside the export schema.
- Received packet mode/status/context/query/note, source IDs/URLs/full supplied snippets, saved-review dates, publication dates and region labels. Source text is plain JSON data and is preserved rather than redacted. Presence in the source list does not mean a source passed matching.
- Separate export and reported retrieval timestamps, explicit evidence limitations, evaluator version and stable fingerprints.

Fixture retrieval is always `null`, even if a caller supplies a date. A failed or empty live-labelled packet has `retrievedAt: null`; `reportedCheckedAt` preserves what the received packet reported. A successful live label remains **unverified**: downloading or hashing does not authenticate a source, request ID, effective date or current applicability.

Exposure remains an assumption-based review amount. It is not realized savings, profit or guaranteed recovery. These are synthetic counterfactual checks, not store experiments or change authorization.

## Integration surface

`shared/policy-test-audit.ts` is a pure local module with `buildPolicyTestAudit()` and `serializePolicyTestAudit()`. It uses the already pinned `@noble/hashes` and Zod dependencies. No new dependency, endpoint, storage, environment lookup or network transport is added.

`PolicyResearch` passes its existing analysis metadata and selected finding to `PolicyTestLab`. The download handler rebuilds decisions from the current packet and action. It cannot accept caller-supplied verdicts. It creates a JSON Blob, removes its temporary link, revokes its URL, retains keyboard focus and announces download preparation through the existing live status. A standalone lab can omit dataset metadata; the export records `dataset: null` and an explicit missing-linkage limitation.

`POLICY_TEST_RULESET_VERSION` is `policy-to-test/v1`. Bump it when matching, applicability or judgment semantics change. This version is an implementation label, not a source-code signature.

## Reproduce and compare

The schema is `marginguard.policy-test-audit.v1`. `serializePolicyTestAudit` recursively sorts object keys, preserves array order, emits two-space JSON and one trailing LF. Hash those UTF-8 bytes:

1. `packetSha256`: SHA-256 of `evidence` serialized by that function.
2. `auditSha256`: SHA-256 of `{ schemaVersion, dataset, evidence, evaluation, limitations }` serialized by that function.

The hashes exclude `exportedAt` and `fingerprints`. An action-only comparison should retain the packet hash and change the audit hash. Source/body/metadata/context/status changes alter the packet hash; seller assumptions and finding data alter the audit hash. The original CSV identifier is only its existing 16-character SHA-256 prefix and is labelled as such. These unsigned hashes detect differences; they do not prove origin or prevent a person from changing a file and recalculating hashes.

Generate the committed synthetic example locally:

```sh
node --import tsx scripts/export-policy-test-audit-example.ts
```

The example explicitly supplies empty provider configuration and a transport that throws on any attempted call. It reads only the checked-in synthetic CSV. Its research ID identifies an authored example, not a server-issued live request.

## Development verification

Tests were written first; the first unit run failed with the expected missing-module error before implementation. The new eight unit cases cover all decisions/HOLD records, stable and independently recomputable hashes, tamper sensitivity, invalid dates/financial inputs, failed/retracted/malicious sources, provenance and metadata-only snapshots.

```sh
node --import tsx --test tests/policy-test-audit.test.ts
npm test
npm run lint
npm run build:offline-demo
node --import tsx scripts/verify-policy-to-test-ui.ts
# Against a loopback-only `npm run start:qa` server:
npx playwright test
```

The three new browser cases parse real downloads, test action changes and a failed live-labelled packet, block external requests and check zero requests during export. They check 320px layout, keyboard activation, retained focus, 44px targets, visible focus, accessible description, reduced motion and a single status region. Existing Policy-to-Test regressions remain included.

No final benchmark, video, upload, deployment or external paid call is part of this increment. Fixed-basket Preflight A/B remains outside this change. Review the patch before applying to a newer main, especially if the PolicyResearch call site or matching semantics have changed.

## Integrated review, October 30

This local integration is based on bridge candidate
`5497ed8119d8bbded4acd91ff23bbd2b1efc4bff`, which itself extends public main
`9bade621874e08359b901b1fe03729619176334c`. The bridge publication is a separate
pending operation; this export must not indirectly publish its blocked evidence.
The combined test configuration retains both bridge and audit-download scenarios.
Reverification passed lint, strict types, Node/Worker builds, 264 unit/API tests,
65 offline harness self-tests, 12 routing cases, 13 forced-offline artifact routes,
and the same 57 browser scenarios on Node and the offline Worker. The three new
browser cases inspect actual local downloads, including 320px keyboard behavior.
No new provider request, credential configuration or final benchmark was made.
