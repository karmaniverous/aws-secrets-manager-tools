/**
 * Requirements addressed:
 * - Provide a public tools-style wrapper `AwsSecretsManagerTools`.
 * - Package consumers should not need to construct SecretsManagerClient; they
 *   should use `AwsSecretsManagerTools.init(...)` and optionally import AWS SDK
 *   Commands for advanced operations.
 * - Expose the fully configured SDK client via `tools.client`.
 * - Support optional AWS X-Ray capture:
 *   - Default “auto”: enable only when AWS_XRAY_DAEMON_ADDRESS is set.
 *   - In “auto”, if the daemon address is set but aws-xray-sdk is missing,
 *     throw with a clear message.
 * - Enforce a minimal logger contract (debug/info/warn/error); do not attempt
 *   to polyfill or proxy unknown loggers.
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

import { isResourceNotFoundError } from './awsError';
import type { EnvSecretMap } from './envSecretMap';
import { captureAwsSdkV3Client, shouldEnableXray } from './xray';

/**
 * Console-like logger contract used by AwsSecretsManagerTools.
 *
 * If you pass a custom logger via `clientConfig.logger`, it must implement
 * these methods (no internal polyfills are applied).
 */
export type AwsSecretsManagerToolsLogger = Pick<
  Console,
  'debug' | 'error' | 'info' | 'warn'
>;

/** X-Ray capture mode for {@link AwsSecretsManagerTools.init}. */
export type AwsSecretsManagerToolsXrayMode = 'auto' | 'on' | 'off';

/**
 * Materialized X-Ray state for diagnostics and DX.
 *
 * Note: `enabled` reflects the effective runtime decision after applying the
 * configured `mode` and checking daemon configuration.
 */
export type XrayState = {
  /** Capture mode configured for initialization. */
  mode: AwsSecretsManagerToolsXrayMode;
  /** Whether capture is enabled for the effective client instance. */
  enabled: boolean;
  /** Daemon address used when capture is enabled (if available). */
  daemonAddress?: string;
};

/** Options for {@link AwsSecretsManagerTools.init}. */
export type AwsSecretsManagerToolsInitOptions = {
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
  xray?: AwsSecretsManagerToolsXrayMode;
};

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

const parseEnvSecretMap = (secretString: string): EnvSecretMap => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretString);
  } catch {
    throw new Error('SecretString is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Secret JSON must be an object map.');
  }

  const out: Record<string, string | undefined> = {};
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

const toSecretString = (value: EnvSecretMap): string => JSON.stringify(value);

/**
 * Tools-style AWS Secrets Manager wrapper for env-map secrets.
 *
 * The secret payload is always a JSON object map of environment variables:
 * `Record<string, string | undefined>`.
 */
export class AwsSecretsManagerTools {
  /** The effective SDK client (captured when X-Ray is enabled). */
  public readonly client: SecretsManagerClient;
  /** The effective client config used to construct the base client. */
  public readonly clientConfig: SecretsManagerClientConfig;
  /** The logger used by this wrapper and (when applicable) by the AWS client. */
  public readonly logger: AwsSecretsManagerToolsLogger;
  /** Materialized X-Ray state (mode + enabled + daemonAddress when relevant). */
  public readonly xray: XrayState;

  private constructor({
    client,
    clientConfig,
    logger,
    xray,
  }: {
    client: SecretsManagerClient;
    clientConfig: SecretsManagerClientConfig;
    logger: AwsSecretsManagerToolsLogger;
    xray: XrayState;
  }) {
    this.client = client;
    this.clientConfig = clientConfig;
    this.logger = logger;
    this.xray = xray;
  }

  /**
   * Initialize an `AwsSecretsManagerTools` instance.
   *
   * This factory owns all setup (including optional X-Ray capture) so consumers
   * do not need to construct a base Secrets Manager client themselves.
   */
  static async init({
    clientConfig = {},
    xray: xrayMode = 'auto',
  }: AwsSecretsManagerToolsInitOptions = {}): Promise<AwsSecretsManagerTools> {
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
      ? await captureAwsSdkV3Client(base, {
          mode: xrayMode,
          logger,
          daemonAddress,
        })
      : base;

    return new AwsSecretsManagerTools({
      client: effectiveClient,
      clientConfig: effectiveClientConfig,
      logger,
      xray: xrayState,
    });
  }

  /**
   * Read a Secrets Manager secret and parse it as an env-map secret.
   *
   * @throws If the secret is missing, binary, invalid JSON, or not an object map.
   */
  async readEnvSecret({
    secretId,
    versionId,
  }: {
    secretId: string;
    versionId?: string;
  }): Promise<EnvSecretMap> {
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

    return parseEnvSecretMap(res.SecretString);
  }

  /**
   * Write a new version value for an existing secret.
   *
   * This does not create the secret if it does not exist.
   */
  async updateEnvSecret({
    secretId,
    value,
    versionId,
  }: {
    secretId: string;
    value: EnvSecretMap;
    versionId?: string;
  }): Promise<void> {
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
   */
  async createEnvSecret({
    secretId,
    value,
    description,
    forceOverwriteReplicaSecret,
    versionId,
  }: {
    secretId: string;
    value: EnvSecretMap;
    description?: string;
    forceOverwriteReplicaSecret?: boolean;
    versionId?: string;
  }): Promise<void> {
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
   * @returns `'updated'` if updated; `'created'` if the secret was created.
   * @throws Re-throws any non-ResourceNotFound AWS errors.
   */
  async upsertEnvSecret({
    secretId,
    value,
  }: {
    secretId: string;
    value: EnvSecretMap;
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
   */
  async deleteSecret({
    secretId,
    recoveryWindowInDays,
    forceDeleteWithoutRecovery,
  }: {
    secretId: string;
    recoveryWindowInDays?: number;
    forceDeleteWithoutRecovery?: boolean;
  }): Promise<void> {
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
