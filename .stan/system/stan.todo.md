# Development Plan (stan.todo.md)

## Next up

- Run an end-to-end CLI smoke test against a real AWS account.

## Completed (recent)

- Added get-dotenv interop note and formalized requirements + plan (documentation-only).
- Implemented AwsSecretsManagerClient, aws secrets plugin, and get-dotenv CLI.
- Fixed lint errors and prevented Vitest from running stale .rollup.cache tests.
- Fixed remaining typecheck + lint issues (mock Promise returns; EnvSecretMap cast).
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
- Committed smoke fixtures and smoke/.env defaults (optional .env.local).- Fixed smoke harness TS/lint regressions.