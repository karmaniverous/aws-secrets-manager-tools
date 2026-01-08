# Interop note: unify logger contract with AWS (breaking change)

## Summary

This repo (aws-secrets-manager-tools) integrates get-dotenv with AWS SDK v3. We have a recurring mismatch:

- get-dotenv’s exported Logger type is permissive and does not guarantee a stable set of methods.
- AWS SDK v3 client configs require a logger that implements `debug`, `info`, `warn`, and `error`.

I propose a breaking change in get-dotenv to define a single minimal logger contract that works for AWS and therefore works for the broadest possible plugin ecosystem, validated once during option resolution.

## Evidence (real downstream failure)

Downstream TypeScript errors observed when passing get-dotenv’s `silentLogger` (typed as get-dotenv Logger) into AWS SDK v3 `SecretsManagerClientConfig.logger`:

  src/secretsPlugin/commands/registerDeleteCommand.ts(73,9): error TS2322:
  Type '{ region: string; logger: Logger; } | { logger: Logger; }' is not assignable
  to type 'SecretsManagerClientConfig | undefined'.
    Types of property 'logger' are incompatible.
      Type 'Logger' is not assignable to type 'Logger | undefined'.
        Type 'Record<string, (...args: unknown[]) => void>' is missing the following
        properties from type 'Logger': debug, info, warn, error

This is the core mismatch: get-dotenv Logger can be a generic record of functions, which is not assignable to AWS’s required console-like logger interface.

## Current get-dotenv contract (problem)

From get-dotenv public type defs:

  type Logger = Record<string, (...args: unknown[]) => void> | typeof console

This allows objects that do not implement `debug`, `info`, `warn`, and `error`.

That permissiveness leaks into:

- `GetDotenvOptions.logger`
- `GetDotenvCliOptions.logger`
- any exported helpers like `silentLogger` (even if the runtime object has the right methods, the type does not guarantee it)

## Proposed breaking change (next major)

### Minimal logger contract (AWS-compatible)

Redefine get-dotenv’s canonical Logger as:

  export type Logger = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;

Requirements:

- Additional methods are ALLOWED (structural typing already permits this).
- These four methods are GUARANTEED.
- get-dotenv internals must not rely on `logger.log` being present.
- Validation is strict: validate and throw (do not polyfill).

Rationale:

- This matches AWS SDK v3 expectations directly.
- It creates a stable “plugin authoring contract”: any plugin can rely on ctx/options logger being safe to pass into AWS (and other SDKs that expect the same minimal surface).

### Validation timing (during option resolution)

Validate the logger once, as part of resolving/normalizing the effective option bag:

- Programmatic: validate `options.logger` when merging defaults with provided options.
- CLI host: validate the merged root options bag before it is stored/exposed (so `readMergedOptions(...)` and `ctx.optionsResolved.logger` are already safe).
- If invalid, throw early with a clear message.

This ensures:

- Plugins never need to defensively validate logger shapes.
- Downstream SDK client construction can be typed safely without casts.

## get-dotenv exports to support the unified contract

In addition to redefining Logger, export:

- `assertLogger(candidate: unknown): Logger` (throws if invalid)
- `silentLogger: Logger` (a no-op logger that implements the full contract)

Note: if get-dotenv already exports `silentLogger`, its type should become the new Logger (and its runtime value must implement the four required methods).

## Internal get-dotenv changes implied by the contract

This change requires a pass over get-dotenv internals to ensure:

- Only `debug/info/warn/error` are called.
- Any logging previously performed via `log(...)` is migrated to `info(...)` (or another appropriate guaranteed method).
- The resolved options bag exposed to plugins is the validated Logger type.

## Code to transfer from aws-secrets-manager-tools (source of truth)

This repo contains a validated console-like logger contract and validator that should be moved into get-dotenv utilities (not into the aws plugin).

Source file (current implementation):

  src/secretsManager/AwsSecretsManagerTools.ts

Transfer these ideas (and ideally the implementation):

  export type AwsSecretsManagerToolsLogger = Pick<
    Console,
    'debug' | 'error' | 'info' | 'warn'
  >;

  const assertLogger = (candidate: unknown): AwsSecretsManagerToolsLogger => {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(
        'logger must be an object with debug, info, warn, and error methods',
      );
    }
    const logger = candidate as Partial<AwsSecretsManagerToolsLogger>;
    if (
      typeof logger.debug !== 'function' ||
      typeof logger.info !== 'function' ||
      typeof logger.warn !== 'function' ||
      typeof logger.error !== 'function'
    ) {
      throw new Error(
        'logger must implement debug, info, warn, and error methods; wrap/proxy your logger if needed',
      );
    }
    return logger as AwsSecretsManagerToolsLogger;
  };

In get-dotenv, this becomes:

- `export type Logger = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;`
- `export const assertLogger = (...) => Logger;`

## Migration notes (downstream)

This is a breaking change for any consumer passing a logger that does not implement all four methods.

Recommended migration pattern:

- Wrap your logger to implement the four methods, forwarding to your underlying logger as needed.
- Or use `console`.
- Or use get-dotenv’s exported `silentLogger`.

Example adapter shape (conceptual):

  const myLogger: Logger = {
    debug: (...a) => underlying.debug?.(...a),
    info: (...a) => underlying.info?.(...a) ?? underlying.log?.(...a),
    warn: (...a) => underlying.warn?.(...a),
    error: (...a) => underlying.error?.(...a),
  };

With validate-and-throw semantics, invalid loggers will now fail fast during option resolution rather than failing later (or failing only in SDK client setup).

## Why this belongs in get-dotenv utilities (not the aws plugin)

- Logger shape is a foundational interop concern for all plugins, not only AWS.
- Plugins should be able to depend on `ctx.optionsResolved.logger` being SDK-compatible without repeating validation and without casts.
- This aligns get-dotenv’s plugin contract with the expectations of downstream SDKs (AWS and others), reducing friction for plugin authors.

## Requested next steps in get-dotenv

- Introduce a major-version breaking change:
  - redefine Logger to the minimal AWS-compatible contract
  - validate logger during option resolution and expose only validated loggers
  - export assertLogger + silentLogger under the new type
- Update docs (plugin authoring guide) to state the new logger contract explicitly.

End.
