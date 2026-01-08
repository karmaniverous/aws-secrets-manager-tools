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
  type AwsSecretsManagerToolsOptions,
} from './secretsManager/AwsSecretsManagerTools';
export { secretsPlugin } from './secretsPlugin/secretsPlugin';
