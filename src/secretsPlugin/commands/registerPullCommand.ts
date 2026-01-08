/**
 * Requirements addressed:
 * - Provide `aws secrets pull`.
 * - For config-backed plugin options, use plugin dynamic options to show
 *   composed defaults in help output.
 * - Use get-dotenv precedence semantics for deterministic dotenv editing.
 * - Replace scope/privacy flags with `--to <scope>:<privacy>`.
 */

import {
  applyIncludeExclude,
  buildSpawnEnv,
  dotenvExpand,
  editDotenvFile,
  getDotenvCliOptions2Options,
  requireString,
  silentLogger,
} from '@karmaniverous/get-dotenv';
import {
  describeConfigKeyListDefaults,
  readMergedOptions,
} from '@karmaniverous/get-dotenv/cliHost';
import { getAwsRegion } from '@karmaniverous/get-dotenv/plugins/aws';

import { AwsSecretsManagerTools } from '../../secretsManager/AwsSecretsManagerTools';
import { parseToSelector } from '../provenanceSelectors';
import { resolveIncludeExclude } from '../secretsPluginConfig';
import type { SecretsPluginApi, SecretsPluginCli } from './types';

export const registerPullCommand = ({
  cli,
  plugin,
}: {
  cli: SecretsPluginCli;
  plugin: SecretsPluginApi;
}): void => {
  const pull = cli
    .ns('pull')
    .description(
      'Update local dotenv from a Secrets Manager secret (env-map).',
    );

  pull
    .addOption(
      plugin.createPluginDynamicOption(
        pull,
        '-s, --secret-name <string>',
        (_helpCfg, pluginCfg) =>
          `secret name (supports $VAR expansion) (default: ${pluginCfg.secretName ?? '$STACK_NAME'})`,
      ),
    )
    .addOption(
      plugin.createPluginDynamicOption(
        pull,
        '-t, --template-extension <string>',
        (_helpCfg, pluginCfg) => {
          const def = pluginCfg.templateExtension ?? 'template';
          return `dotenv template extension used when target file is missing (default: ${def})`;
        },
      ),
    )
    .addOption(
      plugin.createPluginDynamicOption(
        pull,
        '--to <scope:privacy>',
        (_helpCfg, pluginCfg) => {
          const def = pluginCfg.pull?.to ?? 'env:private';
          return `destination dotenv selector (global|env):(public|private) (default: ${def})`;
        },
      ),
    )
    .addOption(
      plugin
        .createPluginDynamicOption(
          pull,
          '-e, --exclude <strings...>',
          (_helpCfg, pluginCfg) => {
            const { excludeDefault } = describeConfigKeyListDefaults({
              cfgInclude: pluginCfg.pull?.include,
              cfgExclude: pluginCfg.pull?.exclude,
            });
            return `space-delimited list of keys to exclude from the pulled secret (default: ${excludeDefault})`;
          },
        )
        .conflicts('include'),
    )
    .addOption(
      plugin
        .createPluginDynamicOption(
          pull,
          '-i, --include <strings...>',
          (_helpCfg, pluginCfg) => {
            const { includeDefault } = describeConfigKeyListDefaults({
              cfgInclude: pluginCfg.pull?.include,
              cfgExclude: pluginCfg.pull?.exclude,
            });
            return `space-delimited list of keys to include from the pulled secret (default: ${includeDefault})`;
          },
        )
        .conflicts('exclude'),
    )
    .action(async (opts, command) => {
      const logger = console;
      const ctx = cli.getCtx();
      const bag = readMergedOptions(command);
      const rootOpts = getDotenvCliOptions2Options(bag);
      const cfg = plugin.readConfig(pull);
      const sdkLogger = bag.debug ? console : silentLogger;

      const paths = rootOpts.paths ?? ['./'];
      const dotenvToken = rootOpts.dotenvToken ?? '.env';
      const privateToken = rootOpts.privateToken ?? 'local';

      const toRaw = opts.to ?? cfg.pull?.to ?? 'env:private';
      const to = parseToSelector(toRaw);

      const envRef = buildSpawnEnv(process.env, ctx.dotenv);
      const secretNameRaw = opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
      const secretId = dotenvExpand(secretNameRaw, envRef);
      if (!secretId) throw new Error('secret-name is required.');

      const region = getAwsRegion(ctx);
      const tools = new AwsSecretsManagerTools({
        clientConfig: region
          ? { region, logger: sdkLogger }
          : { logger: sdkLogger },
      });

      logger.info(`Pulling secret '${secretId}' from AWS Secrets Manager...`);
      const rawSecrets = await tools.readEnvSecret({ secretId });

      const { include, exclude } = resolveIncludeExclude({
        cliInclude: opts.include,
        cliExclude: opts.exclude,
        cfgInclude: cfg.pull?.include,
        cfgExclude: cfg.pull?.exclude,
      });
      const secrets = applyIncludeExclude(rawSecrets, { include, exclude });

      const templateExtension =
        opts.templateExtension ?? cfg.templateExtension ?? 'template';

      const editCommon = {
        paths,
        dotenvToken,
        privateToken,
        privacy: to.privacy,
        templateExtension,
      };

      const res =
        to.scope === 'env'
          ? await editDotenvFile(secrets, {
              ...editCommon,
              scope: 'env',
              env: requireString(
                bag.env ?? bag.defaultEnv,
                'env is required (use --env or defaultEnv).',
              ),
            })
          : await editDotenvFile(secrets, {
              ...editCommon,
              scope: 'global',
            });

      logger.info(`Updated ${res.path}`);
    });
};
