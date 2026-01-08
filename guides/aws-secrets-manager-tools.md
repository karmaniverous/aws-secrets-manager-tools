---
title: AwsSecretsManagerTools
---

# AwsSecretsManagerTools (programmatic API)

This guide explains how to use `AwsSecretsManagerTools` as a small, opinionated wrapper around AWS Secrets Manager for “env-map” secrets (JSON object maps of environment variables).

If you’re looking for the CLI or plugin behavior instead, see the [aws secrets plugin guide](./secrets-plugin.md).

## Install and import

```bash
npm i @karmaniverous/aws-secrets-manager-tools
```

This package is ESM-only (Node >= 20).

```ts
import { AwsSecretsManagerTools } from '@karmaniverous/aws-secrets-manager-tools';
```

## Mental model: “env-map” secrets

This library treats `SecretString` as JSON with the following shape:

```json
{ "KEY": "value", "OPTIONAL": null }
```

- Values must be `string` or `null`.
- When reading, `null` is decoded as `undefined` (because JSON cannot represent `undefined`).
- Binary secrets (`SecretBinary`) are not supported by this wrapper.

The canonical type is:

```ts
export type ProcessEnv = ProcessEnv;
```

## Initialize once: `AwsSecretsManagerTools.init(...)`

Create a configured instance (recommended usage):

```ts
import { AwsSecretsManagerTools } from '@karmaniverous/aws-secrets-manager-tools';

const tools = await AwsSecretsManagerTools.init({
  clientConfig: {
    region: 'us-east-1',
    logger: console,
  },
  xray: 'auto',
});
```

### Init options

`AwsSecretsManagerTools.init({ ... })` accepts:

- `clientConfig?: SecretsManagerClientConfig`
  - Any AWS SDK v3 Secrets Manager client configuration (region, credentials, retry options, etc.).
  - If `clientConfig.logger` is provided, it must implement `debug`, `info`, `warn`, and `error`. The wrapper validates this contract up front (it does not polyfill missing methods).
- `xray?: 'auto' | 'on' | 'off'`
  - `'auto'` (default): enable only when `AWS_XRAY_DAEMON_ADDRESS` is set.
  - `'on'`: force capture (requires `AWS_XRAY_DAEMON_ADDRESS` and `aws-xray-sdk`).
  - `'off'`: never enable capture.

### Observability and diagnostics

The instance exposes a few helpful properties:

- `tools.client`: the effective `SecretsManagerClient` (captured/instrumented when X-Ray is enabled)
- `tools.clientConfig`: the effective config used to construct the base client
- `tools.logger`: the validated console-like logger
- `tools.xray`: `{ mode, enabled, daemonAddress? }` reflecting the effective runtime decision

## Escape hatch: use the raw AWS SDK client

When you need AWS Secrets Manager APIs that aren’t wrapped by this package, use `tools.client` directly and import AWS SDK command classes as needed:

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

### Read: `readEnvSecret(...)`

Read and decode an env-map secret:

```ts
const env = await tools.readEnvSecret({ secretId: 'my-app/dev' });
```

- Accepts `{ secretId, versionId? }`
- Throws if:
  - `SecretString` is missing (binary secrets are not supported)
  - `SecretString` is invalid JSON
  - JSON is not an object map
  - any value is not `string | null`

### Update: `updateEnvSecret(...)`

Write a new secret version for an existing secret:

```ts
await tools.updateEnvSecret({
  secretId: 'my-app/dev',
  value: { API_URL: 'https://example.com' },
});
```

Notes:

- This does not create the secret if it doesn’t exist.
- `versionId` (optional) is forwarded as `ClientRequestToken` for idempotency.

### Create: `createEnvSecret(...)`

Create a new secret with an env-map payload:

```ts
await tools.createEnvSecret({
  secretId: 'my-app/dev',
  value: { API_URL: 'https://example.com' },
  description: 'my-app dev env',
});
```

### Upsert: `upsertEnvSecret(...)`

Update the secret if it exists, otherwise create it:

```ts
const mode = await tools.upsertEnvSecret({
  secretId: 'my-app/dev',
  value: { API_URL: 'https://example.com' },
});
// mode is 'updated' or 'created'
```

Behavior note:

- This only creates on `ResourceNotFoundException`. Other AWS errors are re-thrown.

### Delete: `deleteSecret(...)`

Delete a secret (recoverable by default):

```ts
await tools.deleteSecret({ secretId: 'my-app/dev' });
```

Options:

- `{ recoveryWindowInDays?: number }` to set a specific recovery window
- `{ forceDeleteWithoutRecovery?: boolean }` to permanently delete (dangerous)

## AWS X-Ray capture (optional)

X-Ray capture is guarded and uses a dynamic import:

- Install the optional peer dependency if you want capture:
  - `aws-xray-sdk`
- In `'auto'` mode, capture is enabled only when `AWS_XRAY_DAEMON_ADDRESS` is set.
- In `'auto'` mode, if the daemon address is set but `aws-xray-sdk` is not installed, initialization throws with a clear message.

## Next steps

- For the CLI/plugin workflow (`aws secrets pull|push|delete`), see the [aws secrets plugin guide](./secrets-plugin.md).
- For a short package overview, see the [README](../README.md).
