/**
 * get-dotenv integration entry point. Import this optional-peer boundary from
 * `@karmaniverous/aws-secrets-manager-tools/get-dotenv`.
 *
 * @packageDocumentation
 */

export { secretsPlugin } from '../secretsPlugin/secretsPlugin';
export {
  type SecretsPluginConfig,
  secretsPluginConfigSchema,
} from '../secretsPlugin/secretsPluginConfig';
