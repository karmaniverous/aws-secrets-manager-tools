/**
 * This is the main entry point for the library.
 *
 * @packageDocumentation
 */

/**
 * Requirements addressed:
 * - Export a public `AwsSecretsManagerTools` without loading get-dotenv.
 * - Export local public `Logger` and `ProcessEnv` contracts.
 */

export { assertLogger, type Logger } from './logger';
export type { ProcessEnv } from './processEnv';
export {
  AwsSecretsManagerTools,
  type AwsSecretsManagerToolsOptions,
} from './secretsManager/AwsSecretsManagerTools';
