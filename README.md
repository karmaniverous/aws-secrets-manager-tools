# AWS Secrets Manager Tools

Tools for working with AWS Secrets Manager “env-map” secrets.

This package provides:

- A tools-style wrapper that owns AWS client setup (including optional X-Ray capture):
  - `AwsSecretsManagerTools`
- A get-dotenv plugin mounted under `aws`:
  - `aws secrets pull|push|delete`
- A CLI embedding get-dotenv with the secrets plugin:
  - `aws-secrets-manager-tools`

## Install

```bash
npm i @karmaniverous/aws-secrets-manager-tools
```

This package is ESM-only (Node >= 20).

## Programmatic usage

Initialize once, then use convenience methods (env-map secrets):

```ts
import { AwsSecretsManagerTools } from '@karmaniverous/aws-secrets-manager-tools';

const tools = await AwsSecretsManagerTools.init({
  clientConfig: { region: 'us-east-1', logger: console },
  xray: 'auto',
});

const env = await tools.readEnvSecret({ secretId: 'my-app/dev' });
await tools.upsertEnvSecret({ secretId: 'my-app/dev', value: env });
```

### init options

`AwsSecretsManagerTools.init({ ... })` accepts:

- `clientConfig`: AWS SDK v3 `SecretsManagerClientConfig` (region, credentials, retry settings, etc.).
  - If `clientConfig.logger` is provided, it must implement: `debug`, `info`, `warn`, `error`.
- `xray`: `'auto' | 'on' | 'off'` (default: `'auto'`).

### Escape hatch: full AWS SDK client

When you need AWS functionality not wrapped by this package, use the fully configured SDK client at `tools.client` and import command classes from the AWS SDK as needed:

```ts
import { ListSecretsCommand } from '@aws-sdk/client-secrets-manager';
import { AwsSecretsManagerTools } from '@karmaniverous/aws-secrets-manager-tools';

const tools = await AwsSecretsManagerTools.init({
  clientConfig: { region: 'us-east-1', logger: console },
});

const res = await tools.client.send(new ListSecretsCommand({}));
console.log(res.SecretList?.length ?? 0);
```

## Convenience methods (env-map secrets)

The tools wrapper provides convenience methods for env-map secrets (JSON object maps of env vars):

- `readEnvSecret({ secretId, versionId? }) -> EnvSecretMap`
  - Reads `SecretString` and parses it as an object map.
  - `null` values decode to `undefined`.
- `updateEnvSecret({ secretId, value, versionId? }) -> Promise<void>`
  - Updates an existing secret value (does not create the secret).
- `createEnvSecret({ secretId, value, description?, forceOverwriteReplicaSecret?, versionId? }) -> Promise<void>`
  - Creates a new secret with an env-map payload.
- `upsertEnvSecret({ secretId, value }) -> Promise<'updated' | 'created'>`
  - Updates if the secret exists; creates only when the error is `ResourceNotFoundException`.
- `deleteSecret({ secretId, recoveryWindowInDays?, forceDeleteWithoutRecovery? }) -> Promise<void>`
  - Recoverable deletion by default.
  - `recoveryWindowInDays` conflicts with `forceDeleteWithoutRecovery`.

## Env-map secret format

Secrets are stored as a JSON object map of environment variables:

```json
{ "KEY": "value", "OPTIONAL": null }
```

Notes:

- Values must be strings or `null`.
- `null` is treated as `undefined` when decoding.

## AWS X-Ray (optional)

X-Ray capture is optional and guarded:

- Default behavior is `xray: 'auto'`: capture is enabled only when `AWS_XRAY_DAEMON_ADDRESS` is set.
- To enable capture, install the optional peer dependency:
  - `aws-xray-sdk`
- In `auto` mode, if `AWS_XRAY_DAEMON_ADDRESS` is set but `aws-xray-sdk` is not installed, initialization throws.

## CLI usage

The CLI is a get-dotenv CLI with `aws secrets` mounted under `aws`:

```bash
aws-secrets-manager-tools --env dev aws secrets pull --secret-name '$STACK_NAME'
aws-secrets-manager-tools --env dev aws secrets push --secret-name '$STACK_NAME'
aws-secrets-manager-tools --env dev aws secrets delete --secret-name '$STACK_NAME'
```

Notes:

- `--env` is a root-level (get-dotenv) option and must appear before the command path.
- Secret name expansion is evaluated at action time against: `{ ...process.env, ...ctx.dotenv }` (ctx wins).
- `delete` is recoverable by default; pass `--force` to delete without recovery.

### `pull` destination selector (`--to`)

`aws secrets pull` writes to a single dotenv file selected by `--to`:

- `--to env:private` (default) → `.env.<env>.<privateToken>` (e.g. `.env.dev.local`)
- `--to env:public` → `.env.<env>`
- `--to global:private` → `.env.<privateToken>`
- `--to global:public` → `.env`

When `--to env:*` is selected, `--env` (or defaultEnv) is required.

### `push` provenance selector (`--from`)

`aws secrets push` selects which loaded keys to push using get-dotenv provenance (`ctx.dotenvProvenance`) and the effective provenance entry only.

- `--from file:env:private` is the default selection.
- Use repeatable `--from ...` selectors to broaden/narrow efficiently, then optionally apply `--include/--exclude` as a final key filter.