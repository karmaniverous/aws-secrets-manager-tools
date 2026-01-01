# Development Plan (stan.todo.md)

## Next up

- Update the package to be ESM-only:
  - Remove CJS + IIFE outputs from Rollup and update `package.json` exports accordingly.
  - Re-run `npm run lint`, `npm run test`, `npm run typecheck`, `npm run docs`, `npm run build` and fix any remaining issues.
- Refactor the public wrapper API:
  - Rename `AwsSecretsManagerClient` -> `AwsSecretsManagerTools`.
  - Replace public construction with `await AwsSecretsManagerTools.init({ clientConfig?, xray? })` and make the constructor non-public.
  - Expose `tools.client` (effective/captured client), plus materialize `tools.logger`, `tools.xray`, and `tools.clientConfig`.
  - Remove any injected-client option from the public API.
  - Rename wrapper methods to: `readEnvSecret`, `updateEnvSecret`, `createEnvSecret`, `upsertEnvSecret`, `deleteSecret`.
- Update the get-dotenv plugin/CLI/tests/docs to use the new names and initialization flow.

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
