---
title: STAN assistant guide (aws-secrets-manager-tools)
---

# STAN assistant guide: @karmaniverous/aws-secrets-manager-tools

This guide explains the public API and CLI surface for this repo.

## What this package provides

- A tools-style AWS Secrets Manager wrapper that owns complex setup (including optional X-Ray capture) and exposes the fully configured SDK client:
  - `AwsSecretsManagerTools` (async factory via `AwsSecretsManagerTools.init(...)`)
- A get-dotenv plugin intended to be mounted under `aws`:
  - `secretsPlugin()` → provides `aws secrets pull|push|delete`
- A CLI that embeds get-dotenv with the secrets plugin under `aws`:
  - `aws-secrets-manager-tools`

## Public API (imports)

```ts
import {
  AwsSecretsManagerTools,
  secretsPlugin,
  type EnvSecretMap,
} from '@karmaniverous/aws-secrets-manager-tools';
```

### AwsSecretsManagerTools

The tools wrapper assumes Secrets Manager secrets are stored as a JSON object map of env vars.

Initialize tools (recommended):

```ts
import { AwsSecretsManagerTools } from '@karmaniverous/aws-secrets-manager-tools';

const tools = await AwsSecretsManagerTools.init({
  clientConfig: { region: 'us-east-1', logger: console },
  xray: 'auto',
});
```

Escape hatch: the fully configured AWS SDK v3 client is available at `tools.client`.

Import AWS SDK command classes as needed for advanced operations:

```ts
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';

const res = await tools.client.send(new ListSecretsCommand({}));
```

Convenience methods (env-map secrets):

- Reads:
  - `readEnvSecret({ secretId, versionId? }) -> EnvSecretMap`
- Writes:
  - `updateEnvSecret({ secretId, value, versionId? })` (update-only; does not create)
  - `createEnvSecret({ secretId, value, description?, forceOverwriteReplicaSecret?, versionId? })`
  - `upsertEnvSecret({ secretId, value })`
  - `deleteSecret({ secretId, recoveryWindowInDays?, forceDeleteWithoutRecovery? })`

X-Ray capture is optional and guarded:

- Default behavior is “auto”: capture is only enabled when `AWS_XRAY_DAEMON_ADDRESS` is set.
- To enable capture, install the optional peer dependency: `aws-xray-sdk`.
- In “auto” mode, if `AWS_XRAY_DAEMON_ADDRESS` is set but `aws-xray-sdk` is not installed, initialization throws.

## CLI usage

The CLI is a get-dotenv CLI with shipped plugins and `aws secrets` mounted under `aws`:

```bash
aws-secrets-manager-tools --env dev aws secrets pull --secret-name '$STACK_NAME'
aws-secrets-manager-tools --env dev aws secrets push --secret-name '$STACK_NAME'
aws-secrets-manager-tools --env dev aws secrets delete --secret-name '$STACK_NAME'
```

Notes:

- Secret name expansion is evaluated at action-time against: `{ ...process.env, ...ctx.dotenv }` (ctx wins).
- `delete` is recoverable by default; pass `--force` to delete without recovery.

### `pull` destination selection (`--to`)

`aws secrets pull` writes to a single dotenv target selected by `--to`:

- `--to env:private` (default) → `.env.<env>.<privateToken>`
- `--to global:public` → `.env`

When `--to env:*` is selected, `--env` (or defaultEnv) is required.

### `push` payload selection (`--from`)

`aws secrets push` uses get-dotenv provenance (`ctx.dotenvProvenance`) to select a subset of *loaded* keys to push, using only the effective provenance entry for each key:

- `--from file:env:private` (default)
- Additional repeatable `--from <selector>` options can include `config:*:*:*`, `dynamic:*`, or `vars`.
- `--include/--exclude` can be used after provenance selection to fine-tune keys (mutually exclusive; unknown keys ignored).