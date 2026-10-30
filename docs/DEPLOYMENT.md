# Deployment plan and current gates

## Preferred: native Sites Worker ESM

Registered project: `appgprj_6ae108e911088191834d591d732db251`. A current read-only native check returned active status, custom access, saved version zero and no live or expected URL. No judge URL is verified. See [JUDGE-DEMO-PLAN.md](history/JUDGE-DEMO-PLAN.md) for the locally prepared forced-offline profile; no source push, access change or deployment was performed by that preparation.

```text
npm ci --ignore-scripts --registry=https://registry.npmjs.org
npm run check
```

`build:worker` produces the generated `worker/index.js`; the cross-platform copy step produces `dist/server/index.js` and `dist/.openai/hosting.json`. The independent `frontend-dist/` supplies Node production assets and the embedded Worker assets. All HTML, CSS and JS assets are embedded, matching the native Worker ESM starter's single-file contract. It uses standard Web APIs and shares the canonical engine/provider/service source with Express. No Node builtins or native server are forced into Workers.

This local preparation did not invoke a native source-write credential or source workflow. The selected Sites-capable release environment must open the registered project's source repository using a fresh native credential and the supported workflow; preserve `.openai/hosting.json`'s exact project ID. Push the exact reviewed source/build state, save an archive-backed version, set the user-approved public audience, and deploy that saved version. Do not confuse the Sites source repository with the required public GitHub repository. Do not expose or persist source-repository tokens.

The source manifest now declares the logical `d1: "DB"` binding. `db/schema.ts`, `drizzle.config.ts`, and the canonical SQL/snapshot/journal under `drizzle/` define three schema-only operational tables. Fresh generation matches the canonical SQL; repeat generation changes no history; SQLite constraint and concurrent budget checks pass. The earlier SQL under `deploy/migrations/` is retained as historical reference. Actual hosted provisioning and migration application remain deployment checks; declaring a binding is not proof they occurred. With no usable durable binding, public live calls stay disabled even if provider credentials are supplied.

Hosted provider keys are **not authorized yet**. Configure them only through native Sites runtime-secret tools after action-time approval. They must not enter source, client JS, a Git remote, a build command, `.openai/hosting.json`, a video, or logs.

## Runtime cost and abuse controls

- Explicit provider enable flags and consent/click; no automatic search, inference, retry, store modification, or payment.
- Before each attempted upstream operation: default per-provider minute limit 2, UTC daily limit 20, all-time limit 100. Bounded environment overrides: minute ≤6, daily ≤100, total ≤1000.
- Hosted requests require durable reservations and `PROVIDER_HARD_CAPS_VERIFIED=true`, set only after actual provider account caps/free-credit settings have been reviewed. A process-memory counter is not durable protection and is labeled as such in local health output.
- One in-flight request per provider plus ten-second cooldown; Tavily rate/quota/payment-cap responses are visible. Failed attempts consume budget conservatively.
- Model input ≤16,000 UTF-8 bytes; output max 1,600 tokens (1,400 for policy remediation); bounded streamed provider bodies and timeouts. These are request bounds, not a guarantee of dollar cost or a substitute for provider caps.
- Public POSTs require same-origin JSON; upload limit 2 MB/10,000 rows; no remote URL import or arbitrary outbound destination; generated evidence IDs and fixed official-domain plans.
- Live authorization ends December 16, 2026, 00:00 UTC by default, leaving December 15 within the window. The offline site remains available. Provider credits and judge access must actually be checked before release.

After publishing: inspect public accessibility without login, health provider/limit statuses, reset/import/evidence/scenario/export flows, missing-key and budget-denial states, and one explicitly authorized live request. Save actual version/commit/request evidence. No public live state is claimed until observed.

## Researched fallback: Render Free

The official [free-service documentation](https://render.com/docs/free) supports free Node web services and managed TLS. It documents idle spin-down, roughly one-minute cold start, ephemeral files, monthly shared hours and suspension/usage limits. This makes it a plausible offline demo fallback, not an uptime guarantee; signup availability remains unverified. Do not add a payment method or choose a paid plan. Render is not provisioned here.

The existing Express adapter supports explicit `APP_ORIGIN=https://<actual-host>` and `BIND_HOST=0.0.0.0`; `PORT` is configurable. Start with `npm start` after building. A public live configuration still requires a durable budget; an ephemeral free filesystem is insufficient. See [Express hosting](https://render.com/docs/deploy-node-express-app) and [runtime environment variables](https://render.com/docs/environment-variables). Native Sites avoids adding an unrelated hosting account and is preferred.

## GitHub publication gate

The authorized public repository is `https://github.com/Allenllii/marginguard`. Source, synthetic data and verification are published through stacked draft PRs; the exact full-source branch and commit are pinned by the release manifest/handoff, while the default branch has not been advanced by this task. Do not give judges the license-only initial tree as if it were the completed source. Review and merge/release selection remain separate gates. No CLI credential was changed. Exclude environment files, dependency/browser caches, traces, private receipts and credentials from every publication.
