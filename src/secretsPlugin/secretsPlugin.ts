/**
 * Requirements addressed:
 * - Provide get-dotenv plugin mounted as `aws secrets` with commands:
 *   - `aws secrets pull`
 *   - `aws secrets push`
 *   - `aws secrets delete`
 * - Keep the plugin adapter thin: command registration is decomposed into
 *   dedicated modules; core behavior lives outside this file.
 * - For config-backed plugin options, register dynamic options on the command
 *   so help reflects composed defaults and option parsing is typed.
 */

import { definePlugin } from '@karmaniverous/get-dotenv/cliHost';

import { registerDeleteCommand } from './commands/registerDeleteCommand';
import { registerPullCommand } from './commands/registerPullCommand';
import { registerPushCommand } from './commands/registerPushCommand';
import { secretsPluginConfigSchema } from './secretsPluginConfig';

/**
 * get-dotenv plugin that provides `aws secrets pull|push|delete`.
 *
 * Intended usage: mount under `awsPlugin().use(secretsPlugin())`.
 */
export const secretsPlugin = () => {
  const plugin = definePlugin({
    ns: 'secrets',
    configSchema: secretsPluginConfigSchema,
    setup(cli) {
      cli.description('AWS Secrets Manager helpers (env-map secrets).');
      registerPullCommand({ cli, plugin });
      registerPushCommand({ cli, plugin });
      registerDeleteCommand({ cli, plugin });
    },
  });

  return plugin;
};
