# Requirements (stan.requirements.md)

When updated: 2025-12-31T00:00:00Z

## AWS secrets manager tools (get-dotenv based)

- Provide a public TypeScript client named `AwsSecretsManagerClient`.
  - It wraps AWS Secrets Manager operations needed by the CLI/plugin.
  - It uses a console-like logger (info/error/debug).
  - It supports optional AWS X-Ray capture.
    - Default behavior is “auto”: only attempt X-Ray capture when `AWS_XRAY_DAEMON_ADDRESS` is set.
    - Do not import or enable X-Ray capture when the daemon address is not set (the X-Ray SDK will throw).

- Provide a get-dotenv plugin mounted as `aws secrets` with commands:
  - `aws secrets pull`
  - `aws secrets push`
  - `aws secrets delete`

- `aws secrets` behavior:
  - Secret values are always a JSON object map of env vars (`Record<string, string | undefined>`).
  - Secret name expansion (e.g. `$STACK_NAME`) expands against `{ ...process.env, ...ctx.dotenv }` (process.env wins).
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

- Library outputs:
  - ESM at dist/mjs/index.js
  - CJS at dist/cjs/index.js
  - Types bundled at dist/index.d.ts
- Additional outputs:
  - Browser IIFE at dist/index.iife.js (and a minified variant)
  - CLI commands built from src/cli/<command>/index.ts into dist/cli/<command>/index.js with a shebang banner (#!/usr/bin/env node).
- Externalization:
  - Treat Node built-ins and all runtime dependencies/peerDependencies as external.
- Plugins:
  - Keep the library build minimal (TypeScript for transpile; rollup-plugin-dts for types).
  - IIFE/CLI builds may use commonjs/json/node-resolve where helpful.
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
