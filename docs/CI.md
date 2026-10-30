# Offline CI source template

Before the 2026-10-30 source consolidation, this workflow existed only in the local development workspace, main had no `.github/workflows` directory, and no Actions run was observed. Zero runs therefore did not mean a test failure or success. Its complete source is preserved as [`ci/verify.yml`](ci/verify.yml), an inactive template. The existing authenticated CLI has repository write access but no OAuth `workflow` scope, which GitHub requires to add a new active workflow. No extra access was requested, no active workflow was published, and no Actions pass is claimed.

If a separately authorized operator later installs this template at `.github/workflows/verify.yml`, it runs only for ordinary pull requests targeting main and pushes to main. It has contents-read permission, no persistent checkout credential, no provider secrets, no artifact upload, no deployment, no scheduled runs and no final/live benchmark command. Official actions/checkout and actions/setup-node v7 tags were resolved to immutable commit hashes from their official public repositories.

It uses Node 24.19.0, installs the public lockfile with lifecycle scripts disabled, runs `npm run check`, and validates the forced-offline build. That includes small synthetic rule/routing regressions; those are not the final benchmark. Browser scenarios remain separately reported local checks, not CI passes. No run result is claimed until a concrete GitHub run finishes.

Live flags remain explicitly false. Do not add credentials or a live evaluation command to this workflow. A final benchmark must remain a separate, approved operator action after candidate/review gates. No CI or source push deploys the submitted Site automatically. Respect the artifact freeze in RELEASE.md.

References: https://github.com/actions/checkout ; https://github.com/actions/setup-node . The exact commit references are recorded in the YAML.

GitHub permission reference: <https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps>. Adding source under `docs/ci/` does not activate Actions or grant workflow access.
