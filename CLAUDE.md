# MarginGuard

Implementation contract: `docs/SPEC.md` (section 0 is the current submission spec) and `docs/ARCHITECTURE.md`. Earlier process notes and handoffs are in `docs/history/`.

Keep money and eligibility in deterministic code (`server/analysis.ts`, `shared/policy-decision.ts`, `shared/preflight.ts`); models draft and interpret, code validates. Never commit `.env`/`.env.local`, keys, customer data or private benchmark gold. Label recorded provider responses as recorded; never present the offline demo as live.
