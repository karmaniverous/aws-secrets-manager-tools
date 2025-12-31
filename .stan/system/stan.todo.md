# Development Plan (stan.todo.md)

## Next up

- Re-run `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build` and fix any remaining issues.
- Consider changing `aws-xray-sdk` from a hard dependency to an optional peer dependency (keeps installs lighter for most users).
- Update README with actual CLI usage examples once the CLI is verified end-to-end.

## Completed (recent)

- Added get-dotenv interop note and formalized requirements + plan (documentation-only).
- Implemented AwsSecretsManagerClient, aws secrets plugin, and get-dotenv CLI.- Fixed lint errors and prevented Vitest from running stale .rollup.cache tests.