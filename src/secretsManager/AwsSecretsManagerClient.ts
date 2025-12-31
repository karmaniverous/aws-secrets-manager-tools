/**
 * Requirements addressed:
 * - Provide a public `AwsSecretsManagerClient`.
 * - Secrets are JSON object maps of env vars.
 * - Optional X-Ray capture, default “auto”, guarded by AWS_XRAY_DAEMON_ADDRESS.
 * - Region is supplied by the caller (wired from aws plugin context).
 * - Public API is documented enough to satisfy TypeDoc `notDocumented` validation.
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
import { captureAwsSdkV3Client, type Logger, type XrayMode } from './xray';

type AwsSdkV3ClientLike = {
  send: (cmd: unknown) => Promise<unknown>;
};

export type AwsSecretsManagerClientOptions = {
  /** Logger instance (must implement info/error/debug). Defaults to `console`. */
  logger?: Pick<Console, 'debug' | 'error' | 'info'>;
  /** AWS region (passed to the AWS SDK v3 Secrets Manager client). */
  region?: string;
  /**
   * AWS X-Ray capture mode.
   *
   * - `auto` (default): enable only when `AWS_XRAY_DAEMON_ADDRESS` is set.
   * - `on`: force enable (will throw if daemon address is missing).
   * - `off`: disable.
   */
  xray?: 'auto' | 'on' | 'off';
  /**
   * Injection seam for tests and advanced consumers. If provided, region/xray
   * options are ignored.
   */
  client?: { send: (cmd: unknown) => Promise<unknown> };
};

const assertLogger = (logger: Logger) => {
  if (
    typeof logger.info !== 'function' ||
    typeof logger.error !== 'function' ||
    typeof logger.debug !== 'function'
  ) {
    throw new Error('logger must have info, error, and debug methods');
  }
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
 * AWS Secrets Manager wrapper for env-map secrets.
 *
 * The secret payload is always a JSON object map of environment variables:
 * `Record<string, string | undefined>`.
 */
export class AwsSecretsManagerClient {
  readonly #logger: Logger;
  readonly #client: AwsSdkV3ClientLike;

  constructor({
    client,
    logger = console,
    region,
    xray = 'auto',
  }: AwsSecretsManagerClientOptions = {}) {
    assertLogger(logger);
    this.#logger = logger;

    if (client) {
      this.#client = client;
      return;
    }

    const cfg: SecretsManagerClientConfig = {
      ...(region ? ({ region } satisfies SecretsManagerClientConfig) : {}),
    };

    const base = new SecretsManagerClient(cfg);

    // Note: X-Ray capture is guarded by AWS_XRAY_DAEMON_ADDRESS. The X-Ray SDK
    // may throw if daemon configuration is missing, so avoid importing/enabling
    // unless capture is actually enabled.
    this.#client = {
      send: async (cmd: unknown) => {
        const c = await captureAwsSdkV3Client(base, {
          mode: xray as XrayMode,
          logger: this.#logger,
        });
        return (c as unknown as AwsSdkV3ClientLike).send(cmd);
      },
    };
  }

  /**
   * Read a Secrets Manager secret and parse it as an env-map.
   *
   * @throws If the secret is missing, binary, invalid JSON, or not an object map.
   */
  async getEnvSecret({
    secretId,
    versionId,
  }: {
    secretId: string;
    versionId?: string;
  }): Promise<EnvSecretMap> {
    if (!secretId) throw new Error('secretId is required');

    this.#logger.debug(`Getting secret value...`, { secretId, versionId });
    const res = (await this.#client.send(
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
  async putEnvSecret({
    secretId,
    value,
    versionId,
  }: {
    secretId: string;
    value: EnvSecretMap;
    versionId?: string;
  }): Promise<void> {
    if (!secretId) throw new Error('secretId is required');

    this.#logger.debug(`Putting secret value...`, { secretId, versionId });
    await this.#client.send(
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
   * @param name Secret name (or ARN in some contexts).
   */
  async createEnvSecret({
    name,
    value,
    description,
    forceOverwriteReplicaSecret,
    versionId,
  }: {
    name: string;
    value: EnvSecretMap;
    description?: string;
    forceOverwriteReplicaSecret?: boolean;
    versionId?: string;
  }): Promise<void> {
    if (!name) throw new Error('name is required');

    this.#logger.debug(`Creating secret...`, { name, versionId });
    await this.#client.send(
      new CreateSecretCommand({
        Name: name,
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
   * @returns `'put'` if updated; `'created'` if the secret was created.
   * @throws Re-throws any non-ResourceNotFound AWS errors.
   */
  async putOrCreateEnvSecret({
    secretId,
    value,
  }: {
    secretId: string;
    value: EnvSecretMap;
  }): Promise<'put' | 'created'> {
    try {
      await this.putEnvSecret({ secretId, value });
      return 'put';
    } catch (err) {
      if (!isResourceNotFoundError(err)) throw err;
      await this.createEnvSecret({ name: secretId, value });
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

    this.#logger.debug(`Deleting secret...`, {
      secretId,
      recoveryWindowInDays,
      forceDeleteWithoutRecovery,
    });
    await this.#client.send(
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
