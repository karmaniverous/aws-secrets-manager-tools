# Development Plan (stan.todo.md)

## Next up

- Re-run `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build` and fix any remaining issues.
- Update README with actual CLI usage examples once the CLI is verified end-to-end.

## Completed (recent)

- Added get-dotenv interop note and formalized requirements + plan (documentation-only).
- Implemented AwsSecretsManagerClient, aws secrets plugin, and get-dotenv CLI.- Fixed lint errors and prevented Vitest from running stale .rollup.cache tests.- Fixed remaining typecheck + lint issues (mock Promise returns; EnvSecretMap cast).- Changed aws-xray-sdk to optional peer dependency.