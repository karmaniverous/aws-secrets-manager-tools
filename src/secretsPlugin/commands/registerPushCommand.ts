/**
 * Requirements addressed:
 * - Provide `aws secrets push`.
 * - `push` selects payload keys using effective provenance entry only and
 *   repeatable `--from <selector>` selectors (default: file:env:private).
 * - Enforce AWS Secrets Manager SecretString size limit (65,536 bytes).
 * - Dynamic options must be registered on the command to drive typing + help.
 */

import { AwsSecretsManagerTools } from '../../secretsManager/AwsSecretsManagerTools';
import {
  parseFromSelector,
  selectEnvByProvenance,
} from '../provenanceSelectors';
import { resolveIncludeExclude } from '../secretsPluginConfig';
import {
  applyIncludeExclude,
  buildExpansionEnv,
  expandSecretName,
} from '../secretsUtils';
import {
  assertBytesWithinSecretsManagerLimit,
  describeConfigKeyListDefaults,
  describeDefault,
  getAwsRegion,
} from './commandUtils';
import type { SecretsPluginApi, SecretsPluginCli } from './types';

export const registerPushCommand = ({
  cli,
  plugin,
}: {
  cli: SecretsPluginCli;
  plugin: SecretsPluginApi;
}): void => {
  const push = cli
    .ns('push')
    .description(
      'Create or update a Secrets Manager secret from selected loaded keys.',
    );

  push
    .addOption(
      plugin.createPluginDynamicOption(
        push,
        '-s, --secret-name <string>',
        (_helpCfg, pluginCfg) =>
          `secret name (supports $VAR expansion) (default: ${pluginCfg.secretName ?? '$STACK_NAME'})`,
      ),
    )
    // Repeatable: `--from <selector>` may be specified multiple times.
    .addOption(
      plugin
        .createPluginDynamicOption(
          push,
          '--from <selector>',
          (_helpCfg, pluginCfg) => {
            const def = pluginCfg.push?.from?.length
              ? pluginCfg.push.from
              : ['file:env:private'];
            return `provenance selectors for secret payload keys (default: ${describeDefault(def)})`;
          },
        )
        .argParser((value, previous: string[] | undefined) => [
          ...(previous ?? []),
          value,
        ])
        .default(Array<string>()),
    )
    .addOption(
      plugin
        .createPluginDynamicOption(
          push,
          '-e, --exclude <strings...>',
          (_helpCfg, pluginCfg) => {
            const { excludeDefault } = describeConfigKeyListDefaults({
              cfgInclude: pluginCfg.push?.include,
              cfgExclude: pluginCfg.push?.exclude,
            });
            return `space-delimited list of environment variables to exclude (default: ${excludeDefault})`;
          },
        )
        .conflicts('include'),
    )
    .addOption(
      plugin
        .createPluginDynamicOption(
          push,
          '-i, --include <strings...>',
          (_helpCfg, pluginCfg) => {
            const { includeDefault } = describeConfigKeyListDefaults({
              cfgInclude: pluginCfg.push?.include,
              cfgExclude: pluginCfg.push?.exclude,
            });
            return `space-delimited list of environment variables to include (default: ${includeDefault})`;
          },
        )
        .conflicts('exclude'),
    )
    .action(async (opts) => {
      const logger = console;
      const ctx = cli.getCtx();
      const cfg = plugin.readConfig(push);

      const fromRaw = opts.from?.length
        ? opts.from
        : cfg.push?.from?.length
          ? cfg.push.from
          : ['file:env:private'];
      const fromSelectors = fromRaw.map(parseFromSelector);

      const { include, exclude } = resolveIncludeExclude({
        cliInclude: opts.include,
        cliExclude: opts.exclude,
        cfgInclude: cfg.push?.include,
        cfgExclude: cfg.push?.exclude,
      });

      const envRef = buildExpansionEnv(ctx.dotenv);
      const secretNameRaw = opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
      const secretId = expandSecretName(secretNameRaw, envRef);
      if (!secretId) throw new Error('secret-name is required.');

      const selected = selectEnvByProvenance(
        ctx.dotenv,
        ctx.dotenvProvenance,
        fromSelectors,
      );
      const secrets = applyIncludeExclude(selected, { include, exclude });
      assertBytesWithinSecretsManagerLimit(secrets);

      const region = getAwsRegion(ctx);
      const tools = await AwsSecretsManagerTools.init({
        clientConfig: region ? { region, logger } : { logger },
      });

      logger.info(`Pushing secret '${secretId}' to AWS Secrets Manager...`);
      const mode = await tools.upsertEnvSecret({ secretId, value: secrets });
      logger.info(mode === 'created' ? 'Created.' : 'Updated.');
    });
};
