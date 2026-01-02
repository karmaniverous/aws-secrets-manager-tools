# Development Plan (stan.todo.md)

## Next up

- Update `aws secrets push` to select payload keys from `ctx.dotenv` using provenance-based `--from` selectors (default `file:env:private`), then narrow with include/exclude, and enforce the 64 KiB SecretString size limit.
- Update `aws secrets pull` to use `--to <scope>:<privacy>` for destination selection (replace `--scope/--privacy`), require `--env` only for `env:*`, and add include/exclude filtering.
- Add safe plugin config defaults under `plugins['aws/secrets']` (no dangerous delete defaults).
- Add/adjust tests for selector parsing, provenance matching (effective entry only), include/exclude interactions, and size guardrail behavior.
- Update README and the repo STAN assistant guide to document `--from`/`--to` usage and the provenance-based selection model.
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
