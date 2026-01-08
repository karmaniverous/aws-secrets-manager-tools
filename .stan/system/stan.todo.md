# Development Plan (stan.todo.md)

## Next up

- Run `npm run lint`, `npm run test`, `npm run typecheck`, and `npm run build` to validate the aws-xray-tools refactor.
- Run `npm run docs -- --emit none` to confirm the new TypeDoc guides render cleanly.
- Consider publishing a first release once documentation is finalized.

## Completed (recent)

- Added get-dotenv interop note and formalized requirements + plan (documentation-only).
- Implemented AwsSecretsManagerClient, aws secrets plugin, and get-dotenv CLI.
- Fixed lint errors and prevented Vitest from running stale .rollup.cache tests.
- Fixed remaining typecheck + lint issues (mock Promise returns; ProcessEnv cast).
- Changed aws-xray-sdk to optional peer dependency.
- Fixed build script to load `rollup.config.ts` (no missing `rollup.config.mjs`).
- Removed TypeDoc warnings by documenting public API surfaces.
- Suppressed Knip warning for intentionally optional `aws-xray-sdk` peer.
- Fixed Rollup config to avoid importing TS-only source modules at config load time.
- Fixed last TypeDoc warning for injected client `send` type.
- Fixed Rollup externals for dependency subpath imports; removed invalid `Package` type usage in rollup config.
- Updated requirements/plan for ESM-only tools API and init flow.
- Fixed test TS errors when spying on AWS SDK client `send` (overloads).
- Reworked public xray/logger types to avoid TypeDoc warnings.
- Verified TypeDoc runs clean (no warnings).
- Performed full documentation pass (README + TypeDoc).
- Fixed TypeDoc @param warnings for opts destructuring.
- Updated requirements/plan for provenance-based `aws secrets` selectors (`--from`/`--to`).
- Implemented provenance-based `--from`/`--to` selectors with tests and docs.
- Switched CLI conflicts to Commander and added dynamic help defaults.
- Decomposed `aws secrets` commands and fixed dynamic option registration.
- Removed `any` from command shim typing to satisfy lint.
- Fixed command action typing (unknown args + internal casts).
- Added tsx smoke scripts (overlay + CLI flags).
- Committed smoke fixtures and smoke/.env defaults (optional .env.local).
- Fixed smoke harness TS/lint regressions.
- Fixed smoke spawn EINVAL (env + tsx entrypoint).
- Refactored aws secrets CLI/plugin typing to use get-dotenv public types + schema-typed config (no casts).
- Fixed command option inference + smoke env lint (no delete).
- Fixed ctx/config typing in actions (no this.getCtx) and selector narrowing.
- Suppressed build/docs/knip warnings (tsx rollup + TSDoc + knip ignore).
- Fixed smoke harness to spawn tsx via npx (exports-safe).
- Fixed smoke overlay config schema + added smoke progress logs.
- Made smoke output concise by default (SMOKE_VERBOSE=1 for full logs).
- Quieted AWS SDK logging by default; smoke logs now concise.
- Documentation pass: rewrote README and added TypeDoc guides for AwsSecretsManagerTools and the aws secrets plugin.
- Synced the STAN assistant guide with the current API/CLI implementation.
- Use dotenvExpand for --secret-name expansion in aws secrets commands.
- Refactor AwsSecretsManagerTools to use get-dotenv Logger.
- Refactor X-Ray capture to use @karmaniverous/aws-xray-tools and remove redundant local implementation; fix STAN imports to use node_modules sources.
