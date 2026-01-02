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
import {
  coerceSecretsPluginConfig,
  resolveIncludeExclude,
} from '../secretsPluginConfig';
import {
  applyIncludeExclude,
  buildExpansionEnv,
  expandSecretName,
} from '../secretsUtils';
import {
  assertBytesWithinSecretsManagerLimit,
  describeConfigKeyListDefaults,
  describeDefault,
} from './commandUtils';
import type { SecretsPluginApi, SecretsPluginCli } from './types';

type PushOpts = {
  secretName?: string;
  from?: string[];
  exclude?: string[];
  include?: string[];
};

export const registerPushCommand = ({
  cli,
  plugin,
}: {
  cli: unknown;
  plugin: unknown;
}): void => {
  const c = cli as SecretsPluginCli;
  const p = plugin as SecretsPluginApi;

  const push = c
    .command('push')
    .description(
      'Create or update a Secrets Manager secret from selected loaded keys.',
    );

  push.addOption(
    p.createPluginDynamicOption(
      push,
      '-s, --secret-name <string>',
      (_helpCfg, pluginCfg) => {
        const cfg = coerceSecretsPluginConfig(pluginCfg);
        const def = cfg.secretName ?? '$STACK_NAME';
        return `secret name (supports $VAR expansion) (default: ${def})`;
      },
    ),
  );

  // Repeatable: `--from <selector>` may be specified multiple times.
  push.addOption(
    p
      .createPluginDynamicOption(
        push,
        '--from <selector>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.push?.from?.length
            ? cfg.push.from
            : ['file:env:private'];
          return `provenance selectors for secret payload keys (default: ${describeDefault(def)})`;
        },
      )
      .argParser((value, previous) => [
        ...(Array.isArray(previous) ? (previous as string[]) : []),
        value,
      ])
      .default([]),
  );

  push.addOption(
    p
      .createPluginDynamicOption(
        push,
        '-e, --exclude <strings...>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const { excludeDefault } = describeConfigKeyListDefaults({
            cfgInclude: cfg.push?.include,
            cfgExclude: cfg.push?.exclude,
          });
          return `space-delimited list of environment variables to exclude (default: ${excludeDefault})`;
        },
      )
      .conflicts('include'),
  );

  push.addOption(
    p
      .createPluginDynamicOption(
        push,
        '-i, --include <strings...>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const { includeDefault } = describeConfigKeyListDefaults({
            cfgInclude: cfg.push?.include,
            cfgExclude: cfg.push?.exclude,
          });
          return `space-delimited list of environment variables to include (default: ${includeDefault})`;
        },
      )
      .conflicts('exclude'),
  );

  push.action(async (opts: PushOpts) => {
    const logger = console;
    const ctx = c.getCtx();
    const cfg = coerceSecretsPluginConfig(p.readConfig(c));

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

    if (!ctx.dotenvProvenance) {
      throw new Error(
        'dotenv provenance is missing (requires get-dotenv v6.4.0+).',
      );
    }

    const selected = selectEnvByProvenance(
      ctx.dotenv,
      ctx.dotenvProvenance,
      fromSelectors,
    );
    const secrets = applyIncludeExclude(selected, { include, exclude });
    assertBytesWithinSecretsManagerLimit(secrets);

    const region = ctx.plugins?.aws?.region;
    const tools = await AwsSecretsManagerTools.init({
      clientConfig: region ? { region, logger } : { logger },
    });

    logger.info(`Pushing secret '${secretId}' to AWS Secrets Manager...`);
    const mode = await tools.upsertEnvSecret({ secretId, value: secrets });
    logger.info(mode === 'created' ? 'Created.' : 'Updated.');
  });
};
