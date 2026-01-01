# Requirements (stan.requirements.md)

When updated: 2025-12-31T00:00:00Z

## AWS secrets manager tools (get-dotenv based)

- Provide a public TypeScript wrapper named `AwsSecretsManagerTools`.
  - It owns the complex client setup (including optional AWS X-Ray capture) and exposes the fully configured SDK client for advanced usage.
  - Downstream consumers should primarily import this package (not construct `SecretsManagerClient` themselves) and may import AWS SDK command classes as needed for advanced operations.

- Construction
  - Provide an async factory:
    - `AwsSecretsManagerTools.init({ clientConfig?, xray? }) -> Promise<AwsSecretsManagerTools>`
  - The class constructor is not public (private/protected).
  - Do not support injecting a pre-built SDK client.

- Exposed instance state (DX / debugging)
  - `tools.client`: the effective AWS SDK v3 `SecretsManagerClient` instance.
    - When X-Ray is enabled, this must be the captured/instrumented client.
  - `tools.clientConfig`: the effective `SecretsManagerClientConfig` used to construct the base client.
  - `tools.xray`: materialized X-Ray state (mode + enabled flag + daemon address when relevant).
  - `tools.logger`: the logger used by the wrapper and used (as appropriate) for client construction/capture logging.

- Logging contract
  - The wrapper uses a console-like logger and requires the minimal set of methods it calls:
    - `debug`, `info`, `warn`, `error`
  - If `clientConfig.logger` is provided, validate it satisfies the contract; otherwise throw with a clear message instructing downstream consumers to proxy/wrap their logger.
  - If no logger is provided, default to `console`.

- Wrapper operations (env-map secrets)
  - Secret values are always a JSON object map of env vars (`Record<string, string | undefined>`).
  - Provide convenience methods with “tools-y” names:
    - `readEnvSecret({ secretId, versionId? })`
    - `updateEnvSecret({ secretId, value, versionId? })` (update-only; does not create)
    - `createEnvSecret({ secretId, value, description?, forceOverwriteReplicaSecret?, versionId? })`
    - `upsertEnvSecret({ secretId, value })` (create if missing, else update)
    - `deleteSecret({ secretId, recoveryWindowInDays?, forceDeleteWithoutRecovery? })`

- AWS X-Ray capture (guarded)
  - Default behavior is “auto”: only attempt X-Ray capture when `AWS_XRAY_DAEMON_ADDRESS` is set.
  - Do not import or enable X-Ray capture when the daemon address is not set (the X-Ray SDK will throw).
  - In “auto” mode, if `AWS_XRAY_DAEMON_ADDRESS` is set but `aws-xray-sdk` is not installed, throw with a clear error message.

- Provide a get-dotenv plugin mounted as `aws secrets` with commands:
  - `aws secrets pull`
  - `aws secrets push`
  - `aws secrets delete`

- `aws secrets` behavior:
  - Secret values are always a JSON object map of env vars (`Record<string, string | undefined>`).
  - Secret name expansion (e.g. `$STACK_NAME`) expands against `{ ...process.env, ...ctx.dotenv }` (ctx wins).
  - Dotenv file editing uses get-dotenv precedence semantics (“winner path”), not “write all paths”.
    - Prefer `editDotenvFile(...)` target selection behavior (last path wins unless configured otherwise).
  - `delete` defaults to recoverable deletion.
    - Do not specify `RecoveryWindowInDays` unless provided explicitly by the user.
    - Require `--force` to delete without recovery (`ForceDeleteWithoutRecovery: true`).
  - `push` include/exclude filters ignore unknown keys (no error).
  - Region is sourced from the aws plugin context (not hard-coded).

## CLI

- Replace the repo sample CLI with a get-dotenv-based CLI with alias:
  - `aws-secrets-manager-tools`
- The CLI duplicates the default get-dotenv CLI behavior, but includes the `secrets` plugin under `aws`.
- Do not mount `awsWhoamiPlugin` in this repo’s CLI composition.

## Bundling (Rollup)

- Package is ESM-only.
- Library outputs:
  - ESM output (single ESM build; no CJS build).
  - Types bundled at dist/index.d.ts.
- CLI outputs:
  - CLI commands built from src/cli/<command>/index.ts into dist/cli/<command>/index.js with a shebang banner (#!/usr/bin/env node).
- Externalization:
  - Treat Node built-ins and all runtime dependencies/peerDependencies as external.
- Plugins:
  - Keep the library build minimal (TypeScript for transpile; rollup-plugin-dts for types).
  - CLI builds may use commonjs/json/node-resolve where helpful.
- Rollup config contract:
  - rollup.config.ts MUST export:
    - `buildLibrary(dest): RollupOptions`
    - `buildTypes(dest): RollupOptions`
  - stan.rollup.config.ts consumes these for the STAN dev build.

## ESLint

- Use a TypeScript flat config at eslint.config.ts.
- Lint uses @typescript-eslint strictTypeChecked config, Prettier alignment, simple-import-sort, and tsdoc syntax checks.
- Exclude STAN dev build artifacts from lint (ignore `.stan/**`).

## TypeScript configs

- No separate tsconfig.rollup.json is required at this time; the Rollup TypeScript plugin overrides conflicting compiler options for bundling (noEmit=false, declaration=false, etc.).
