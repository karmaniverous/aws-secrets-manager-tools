/**
 * Requirements addressed:
 * - Provide a public tools-style wrapper `AwsSecretsManagerTools`.
 * - Package consumers should not need to construct SecretsManagerClient; they
 *   should construct `new AwsSecretsManagerTools(...)` and optionally import
 *   AWS SDK Commands for advanced operations.
 * - Expose the fully configured SDK client via `tools.client`.
 * - Support optional AWS X-Ray capture:
 *   - Default “auto”: enable only when AWS_XRAY_DAEMON_ADDRESS is set.
 *   - In “auto”, if the daemon address is set but aws-xray-sdk is missing,
 *     throw with a clear message.
 * - Enforce the get-dotenv minimal Logger contract (debug/info/warn/error);
 *   validate and throw (no polyfills or proxies).
 * - Secret values are JSON object maps of env vars.
 */

import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
  type SecretsManagerClientConfig,
} from '@aws-sdk/client-secrets-manager';
import {
  captureAwsSdkV3Client,
  shouldEnableXray,
  type XrayMode,
  type XrayState,
} from '@karmaniverous/aws-xray-tools';
import {
  assertLogger,
  type Logger,
  type ProcessEnv,
} from '@karmaniverous/get-dotenv';

import { isResourceNotFoundError } from './awsError';

/** Options for {@link AwsSecretsManagerTools} construction. */
export type AwsSecretsManagerToolsOptions = {
  /**
   * AWS SDK v3 Secrets Manager client config.
   *
   * Include advanced settings here (region, credentials, retry config, custom
   * endpoint, etc.). If a logger is provided, it must implement
   * debug/info/warn/error.
   */
  clientConfig?: SecretsManagerClientConfig;
  /**
   * AWS X-Ray capture mode.
   *
   * - `auto` (default): enable only when `AWS_XRAY_DAEMON_ADDRESS` is set.
   * - `on`: force enable (throws if daemon address is missing).
   * - `off`: disable.
   */
  xray?: XrayMode;
};

const parseProcessEnv = (secretString: string): ProcessEnv => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    throw new Error('SecretString is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secret JSON must be an object map.');
  }

  const out: ProcessEnv = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (v === null) {
      out[k] = undefined;
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v;
      continue;
    }
    throw new Error(`Secret JSON value for '${k}' must be a string or null.`);
  }
  return out;
};

const toSecretString = (value: ProcessEnv): string => JSON.stringify(value);

/**
 * Tools-style AWS Secrets Manager wrapper for env-map secrets.
 *
 * The secret payload is always a JSON object map of environment variables:
 * `ProcessEnv`.
 *
 * Consumers should typically use the convenience methods on this class, and
 * use {@link AwsSecretsManagerTools.client} as an escape hatch when they need
 * AWS SDK operations not wrapped here.
 */
export class AwsSecretsManagerTools {
  /**
   * The effective SDK client (captured when X-Ray is enabled).
   *
   * Import AWS SDK `*Command` classes as needed and call `tools.client.send(...)`.
   */
  public readonly client: SecretsManagerClient;
  /**
   * The effective client config used to construct the base client.
   *
   * Note: this may contain functions/providers (e.g., credential providers).
   */
  public readonly clientConfig: SecretsManagerClientConfig;
  /** The logger used by this wrapper and (when applicable) by the AWS client. */
  public readonly logger: Logger;
  /** Materialized X-Ray state (mode + enabled + daemonAddress when relevant). */
  public readonly xray: XrayState;

  /**
   * Construct an `AwsSecretsManagerTools` instance.
   *
   * @throws If `clientConfig.logger` is provided but does not implement
   * `debug`, `info`, `warn`, and `error`.
   * @throws If X-Ray capture is enabled (via `xray: 'on'` or `xray: 'auto'`
   * with `AWS_XRAY_DAEMON_ADDRESS` set) but `aws-xray-sdk` is not installed.
   * @throws If X-Ray capture is requested but `AWS_XRAY_DAEMON_ADDRESS` is not set.
   */
  constructor({
    clientConfig = {},
    xray: xrayMode = 'auto',
  }: AwsSecretsManagerToolsOptions = {}) {
    const logger = assertLogger(clientConfig.logger ?? console);

    const effectiveClientConfig: SecretsManagerClientConfig = {
      ...clientConfig,
      logger,
    };

    const base = new SecretsManagerClient(effectiveClientConfig);
    const daemonAddress = process.env.AWS_XRAY_DAEMON_ADDRESS;
    const enabled = shouldEnableXray(xrayMode, daemonAddress);
    const xrayState: XrayState = {
      mode: xrayMode,
      enabled,
      ...(enabled && daemonAddress ? { daemonAddress } : {}),
    };

    const effectiveClient = enabled
      ? captureAwsSdkV3Client(base, {
          mode: xrayMode,
          logger,
          daemonAddress,
        })
      : base;

    this.client = effectiveClient;
    this.clientConfig = effectiveClientConfig;
    this.logger = logger;
    this.xray = xrayState;
  }

  /**
   * Read a Secrets Manager secret and parse it as an env-map secret.
   *
   * @param opts - Options:
   *   - `secretId`: Secret name or ARN.
   *   - `versionId`: Optional version id to read.
   *
   * @throws If the secret is missing, binary, invalid JSON, or not an object map.
   */
  async readEnvSecret(opts: {
    secretId: string;
    versionId?: string;
  }): Promise<ProcessEnv> {
    const { secretId, versionId } = opts;
    if (!secretId) throw new Error('secretId is required');

    this.logger.debug(`Getting secret value...`, { secretId, versionId });
    const res = (await this.client.send(
      new GetSecretValueCommand({
        SecretId: secretId,
        ...(versionId ? { VersionId: versionId } : {}),
      }),
    )) as { SecretString?: string };

    if (!res.SecretString) {
      throw new Error(
        'SecretString is missing (binary secrets not supported).',
      );
    }

    return parseProcessEnv(res.SecretString);
  }

  /**
   * Write a new version value for an existing secret.
   *
   * This does not create the secret if it does not exist.
   *
   * @param opts - Options:
   *   - `secretId`: Secret name or ARN.
   *   - `value`: Env-map payload to store (JSON object map).
   *   - `versionId`: Optional client request token (idempotency).
   */
  async updateEnvSecret(opts: {
    secretId: string;
    value: ProcessEnv;
    versionId?: string;
  }): Promise<void> {
    const { secretId, value, versionId } = opts;
    if (!secretId) throw new Error('secretId is required');

    this.logger.debug(`Putting secret value...`, { secretId, versionId });
    await this.client.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: toSecretString(value),
        ...(versionId ? { ClientRequestToken: versionId } : {}),
      }),
    );
  }

  /**
   * Create a new secret containing an env-map.
   *
   * @param opts - Options:
   *   - `secretId`: Secret name (or ARN in some contexts).
   *   - `value`: Env-map payload to store (JSON object map).
   *   - `description`: Optional AWS secret description.
   *   - `forceOverwriteReplicaSecret`: See AWS CreateSecret behavior for replicas.
   *   - `versionId`: Optional client request token (idempotency).
   */
  async createEnvSecret(opts: {
    secretId: string;
    value: ProcessEnv;
    description?: string;
    forceOverwriteReplicaSecret?: boolean;
    versionId?: string;
  }): Promise<void> {
    const {
      secretId,
      value,
      description,
      forceOverwriteReplicaSecret,
      versionId,
    } = opts;
    if (!secretId) throw new Error('secretId is required');

    this.logger.debug(`Creating secret...`, { secretId, versionId });
    await this.client.send(
      new CreateSecretCommand({
        Name: secretId,
        SecretString: toSecretString(value),
        ...(versionId ? { ClientRequestToken: versionId } : {}),
        ...(description ? { Description: description } : {}),
        ...(typeof forceOverwriteReplicaSecret === 'boolean'
          ? { ForceOverwriteReplicaSecret: forceOverwriteReplicaSecret }
          : {}),
      }),
    );
  }

  /**
   * Put a secret value, creating the secret only when it does not exist.
   *
   * This creates only when the update fails with `ResourceNotFoundException`;
   * other errors are re-thrown.
   *
   * @returns `'updated'` if updated; `'created'` if the secret was created.
   * @throws Re-throws any non-ResourceNotFound AWS errors.
   */
  async upsertEnvSecret({
    secretId,
    value,
  }: {
    secretId: string;
    value: ProcessEnv;
  }): Promise<'updated' | 'created'> {
    try {
      await this.updateEnvSecret({ secretId, value });
      return 'updated';
    } catch (err) {
      if (!isResourceNotFoundError(err)) throw err;
      await this.createEnvSecret({ secretId, value });
      return 'created';
    }
  }

  /**
   * Delete a secret.
   *
   * By default, deletion is recoverable (AWS default recovery window) unless
   * `forceDeleteWithoutRecovery` is set.
   *
   * @param opts - Options:
   *   - `secretId`: Secret name or ARN.
   *   - `recoveryWindowInDays`: Explicit recovery window to use.
   *   - `forceDeleteWithoutRecovery`: Dangerous: delete without recovery.
   *
   * @throws If both `recoveryWindowInDays` and `forceDeleteWithoutRecovery` are provided.
   */
  async deleteSecret(opts: {
    secretId: string;
    recoveryWindowInDays?: number;
    forceDeleteWithoutRecovery?: boolean;
  }): Promise<void> {
    const { secretId, recoveryWindowInDays, forceDeleteWithoutRecovery } = opts;
    if (!secretId) throw new Error('secretId is required');
    if (
      typeof recoveryWindowInDays !== 'undefined' &&
      typeof forceDeleteWithoutRecovery !== 'undefined'
    ) {
      throw new Error(
        'recoveryWindowInDays and forceDeleteWithoutRecovery are mutually exclusive',
      );
    }

    this.logger.debug(`Deleting secret...`, {
      secretId,
      recoveryWindowInDays,
      forceDeleteWithoutRecovery,
    });
    await this.client.send(
      new DeleteSecretCommand({
        SecretId: secretId,
        ...(typeof recoveryWindowInDays === 'number'
          ? { RecoveryWindowInDays: recoveryWindowInDays }
          : {}),
        ...(typeof forceDeleteWithoutRecovery === 'boolean'
          ? { ForceDeleteWithoutRecovery: forceDeleteWithoutRecovery }
          : {}),
      }),
    );
  }
}
