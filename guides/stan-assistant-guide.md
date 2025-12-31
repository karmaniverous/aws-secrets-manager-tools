---
title: STAN assistant guide (aws-secrets-manager-tools)
---

# STAN assistant guide: @karmaniverous/aws-secrets-manager-tools

This guide explains the public API and CLI surface for this repo.

## What this package provides

- A small AWS Secrets Manager wrapper:
  - `AwsSecretsManagerClient`
- A get-dotenv plugin intended to be mounted under `aws`:
  - `secretsPlugin()` → provides `aws secrets pull|push|delete`
- A CLI that embeds get-dotenv with the secrets plugin under `aws`:
  - `aws-secrets-manager-tools`

## Public API (imports)

```ts
import {
  AwsSecretsManagerClient,
  secretsPlugin,
  type EnvSecretMap,
} from '@karmaniverous/aws-secrets-manager-tools';
```

### AwsSecretsManagerClient

The client assumes secrets are stored as a JSON object map of env vars.

- Reads:
  - `getEnvSecret({ secretId }) -> EnvSecretMap`
- Writes:
  - `putOrCreateEnvSecret({ secretId, value })`
  - `deleteSecret({ secretId, recoveryWindowInDays?, forceDeleteWithoutRecovery? })`

X-Ray capture is optional and guarded:

- Default behavior is “auto”: capture is only enabled when `AWS_XRAY_DAEMON_ADDRESS` is set.
- To enable capture, install the optional peer dependency: `aws-xray-sdk`.

## CLI usage

The CLI is a get-dotenv CLI with shipped plugins and `aws secrets` mounted under `aws`:

```bash
aws-secrets-manager-tools aws secrets pull --env dev --secret-name '$STACK_NAME'
aws-secrets-manager-tools aws secrets push --env dev --secret-name '$STACK_NAME'
aws-secrets-manager-tools aws secrets delete --env dev --secret-name '$STACK_NAME'
```

Notes:

- Secret name expansion is evaluated at action-time against: `{ ...process.env, ...ctx.dotenv }` (ctx wins).
- `delete` is recoverable by default; pass `--force` to delete without recovery.
