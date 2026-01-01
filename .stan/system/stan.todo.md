# Development Plan (stan.todo.md)

## Next up

- Eliminate remaining TypeDoc warnings for public xray/logger types (keep API types self-contained and documented).
- Update README with the new programmatic API + CLI usage examples.

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