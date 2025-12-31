/**
 * This is the main entry point for the library.
 *
 * @packageDocumentation
 */

/**
 * Requirements addressed:
 * - Export a public `AwsSecretsManagerClient`.
 * - Export the get-dotenv `secretsPlugin` for mounting under `aws`.
 */

export {
  AwsSecretsManagerClient,
  type AwsSecretsManagerClientOptions,
} from './secretsManager/AwsSecretsManagerClient';
export type { EnvSecretMap } from './secretsManager/envSecretMap';
export { secretsPlugin } from './secretsPlugin/secretsPlugin';
