/**
 * Requirements addressed:
 * - Secret values are always a JSON object map of env vars.
 */

/**
 * Canonical “env secret” shape stored in AWS Secrets Manager.
 *
 * `undefined` values are not representable in JSON; readers should treat `null`
 * values as `undefined` when decoding.
 */
export type EnvSecretMap = Record<string, string | undefined>;
