/**
 * This is the main entry point for the library.
 *
 * @packageDocumentation
 */

/**
 * Requirements addressed:
 * - Export a public `AwsSecretsManagerTools`.
 * - Export the get-dotenv `secretsPlugin` for mounting under `aws`.
 */

export {
  AwsSecretsManagerTools,
  type AwsSecretsManagerToolsInitOptions,
  type AwsSecretsManagerToolsLogger,
  type XrayState,
} from './secretsManager/AwsSecretsManagerTools';
export type { EnvSecretMap } from './secretsManager/envSecretMap';
export { secretsPlugin } from './secretsPlugin/secretsPlugin';
