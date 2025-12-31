# Development Plan (stan.todo.md)

## Next up

- Add `AwsSecretsManagerClient` (public API) with:
  - JSON env-map secret semantics
  - region sourced from get-dotenv aws plugin context (adapter-level wiring)
  - optional X-Ray capture guarded by `AWS_XRAY_DAEMON_ADDRESS`
- Implement get-dotenv plugin `secrets` mounted under `aws`:
  - `aws secrets pull|push|delete` (no aliases)
  - use get-dotenv precedence (“winner path”) for dotenv editing
  - safer delete defaults; require `--force` for no-recovery delete
  - include/exclude ignore unknown keys; use `radash` pick/omit
- Replace sample CLI with get-dotenv CLI alias `aws-secrets-manager-tools`:
  - duplicate default get-dotenv CLI composition
  - omit awsWhoamiPlugin
  - mount secrets plugin under aws (`awsPlugin().use(secretsPlugin())`)
- Add tests for:
  - JSON map validation and error handling in `AwsSecretsManagerClient`
  - command option mapping + precedence selection behavior in the secrets plugin

## Completed (recent)

- Added get-dotenv interop note and formalized requirements + plan (documentation-only).
