---
title: get-dotenv plugin
---

# aws secrets plugin (get-dotenv)

This guide explains the get-dotenv secrets plugin exported by this package:

- `secretsPlugin()` → mounts under `aws` and provides:
  - `aws secrets pull`
  - `aws secrets push`
  - `aws secrets delete`

If you want the programmatic API instead, see the [AwsSecretsManagerTools guide](./aws-secrets-manager-tools.md).

## Install and import

```bash
npm i @karmaniverous/aws-secrets-manager-tools
```

You can either:

- Use the shipped CLI (`aws-secrets-manager-tools`), or
- Embed `secretsPlugin()` inside your own get-dotenv host.

## Using the shipped CLI

The shipped CLI is a get-dotenv CLI host composed with `aws` + `secrets`:

```bash
aws-secrets-manager-tools --env dev aws secrets pull --secret-name '$STACK_NAME'
aws-secrets-manager-tools --env dev aws secrets push --secret-name '$STACK_NAME'
aws-secrets-manager-tools --env dev aws secrets delete --secret-name '$STACK_NAME'
```

Notes:

- `--env` is a get-dotenv root option and must appear before `aws ...`.
- The plugin expands `--secret-name` at action time against `{ ...process.env, ...ctx.dotenv }` (`ctx.dotenv` wins).

## Embedding the plugin in your own host

Mount the plugin under `aws`:

```ts
import { createCli } from '@karmaniverous/get-dotenv/cli';
import { awsPlugin } from '@karmaniverous/get-dotenv/plugins';

import { secretsPlugin } from '@karmaniverous/aws-secrets-manager-tools';

await createCli({
  alias: 'toolbox',
  compose: (program) => program.use(awsPlugin().use(secretsPlugin())),
})();
```

Region sourcing:

- The plugin reads the effective region from the aws plugin’s published ctx state (`ctx.plugins.aws.region`) when available.
- Credentials are expected to come from the standard AWS SDK v3 provider chain (the parent `aws` plugin may export them into `process.env` depending on its configuration).

## Secret format (env-map)

All plugin commands treat the secret value as an “env-map” JSON object:

```json
{ "KEY": "value", "OPTIONAL": null }
```

- Values must be `string` or `null`.
- `null` is decoded as `undefined` when reading.

## `aws secrets pull`

Pull reads an env-map secret and applies it as a partial update to a single dotenv file chosen by `--to`.

### Destination selector: `--to <scope:privacy>`

`--to` selects one target dotenv file:

- `--to env:private` (default) → `.env.<env>.<privateToken>` (example: `.env.dev.local`)
- `--to env:public` → `.env.<env>`
- `--to global:private` → `.env.<privateToken>`
- `--to global:public` → `.env`

When `--to env:*` is selected, `--env` (or `defaultEnv`) must be resolved (the command errors if it cannot determine an environment).

### Template bootstrap: `--template-extension`

If the target dotenv file does not exist, but a sibling template does (for example, `.env.local.template`), the plugin bootstraps the target from the template and then edits it in place. This preserves comments and formatting.

You can configure the template extension via `--template-extension` or config.

### Key filtering: `--include` / `--exclude`

`pull` supports optional key filtering before editing the dotenv file:

- `--include <keys...>`: write only those keys from the pulled secret
- `--exclude <keys...>`: omit those keys from the pulled secret

`--include` and `--exclude` are mutually exclusive.

## `aws secrets push`

Push selects a subset of _loaded_ keys from `ctx.dotenv` and writes them to AWS Secrets Manager (create-or-update).

### Provenance selection: `--from <selector>` (repeatable)

Selection is based on get-dotenv provenance (`ctx.dotenvProvenance`) using only the effective provenance entry (the last entry for each key).

Key points:

- Source of truth for values is `ctx.dotenv` (not `process.env`).
- A key is considered only if:
  - it has a provenance entry, and
  - its effective value is not `undefined`, and
  - its effective provenance entry is not `op: 'unset'`.

The `--from` option is repeatable. When omitted, the default is:

- `--from file:env:private`

Supported selector grammar:

- `file:<scope>:<privacy>`
  - `<scope>` is `global|env|*`
  - `<privacy>` is `public|private|*`
- `config:<configScope>:<scope>:<privacy>`
  - `<configScope>` is `packaged|project|*`
  - `<scope>` is `global|env|*`
  - `<privacy>` is `public|private|*`
- `dynamic:<dynamicSource>`
  - `<dynamicSource>` is `config|programmatic|dynamicPath|*`
- `vars`

Examples:

```bash
# Push only keys whose effective provenance is a public global dotenv file
aws-secrets-manager-tools aws secrets push -s my-secret --from file:global:public

# Allow both file and config layers (effective entry only)
aws-secrets-manager-tools aws secrets push -s my-secret --from file:*:* --from config:*:*:*
```

### Final key filter: `--include` / `--exclude`

After provenance selection, push supports a final narrowing step:

- `--include <keys...>` keeps only those keys
- `--exclude <keys...>` removes those keys

Rules:

- `--include` and `--exclude` are mutually exclusive.
- Unknown keys are ignored (no error).

### Secret size limit enforcement

After selection and filtering, the plugin enforces the AWS Secrets Manager `SecretString` size limit (65,536 bytes, UTF-8):

- If the serialized JSON exceeds the limit, the command fails with a message suggesting narrowing the selection via `--from` / `--include` / `--exclude`.

## `aws secrets delete`

Delete removes a secret:

- Recoverable deletion is the default behavior (AWS default recovery window).
- Use `--force` to delete without recovery (dangerous).
- Use `--recovery-window-days <number>` to set an explicit recovery window.

Safety rules:

- `--force` conflicts with `--recovery-window-days`.
- There is intentionally no config default for “force delete”; it must be explicit at runtime.

## Config defaults (getdotenv.config.\*)

You can set safe defaults in your get-dotenv config under `plugins['aws/secrets']`:

```jsonc
{
  "plugins": {
    "aws/secrets": {
      "secretName": "$STACK_NAME",
      "templateExtension": "template",
      "push": {
        "from": ["file:env:private"],
      },
      "pull": {
        "to": "env:private",
      },
    },
  },
}
```

Notes:

- CLI flags override config defaults.
- For `push.include|push.exclude` and `pull.include|pull.exclude`, the plugin enforces mutual exclusion at runtime.

## Related docs

- Package overview: see the [README](../README.md).
- Programmatic API: see the [AwsSecretsManagerTools guide](./aws-secrets-manager-tools.md).
