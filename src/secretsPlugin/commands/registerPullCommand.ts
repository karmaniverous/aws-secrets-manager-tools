/**
 * Requirements addressed:
 * - Provide `aws secrets pull`.
 * - For config-backed plugin options, use plugin dynamic options to show
 *   composed defaults in help output.
 * - Use get-dotenv precedence semantics for deterministic dotenv editing.
 * - Replace scope/privacy flags with `--to <scope>:<privacy>`.
 */

import { editDotenvFile } from '@karmaniverous/get-dotenv';
import { readMergedOptions } from '@karmaniverous/get-dotenv/cliHost';

import { AwsSecretsManagerTools } from '../../secretsManager/AwsSecretsManagerTools';
import { parseToSelector } from '../provenanceSelectors';
import {
  coerceSecretsPluginConfig,
  resolveIncludeExclude,
} from '../secretsPluginConfig';
import {
  applyIncludeExclude,
  buildExpansionEnv,
  expandSecretName,
} from '../secretsUtils';
import { describeConfigKeyListDefaults, requireString } from './commandUtils';
import type { SecretsPluginApi, SecretsPluginCli } from './types';

type PullOpts = {
  secretName?: string;
  templateExtension?: string;
  to?: string;
  exclude?: string[];
  include?: string[];
};

type ReadMergedOptionsCommand = Parameters<typeof readMergedOptions>[0];

export const registerPullCommand = ({
  cli,
  plugin,
}: {
  cli: unknown;
  plugin: unknown;
}): void => {
  const c = cli as SecretsPluginCli;
  const p = plugin as SecretsPluginApi;

  const pull = c
    .command('pull')
    .description(
      'Update local dotenv from a Secrets Manager secret (env-map).',
    );

  pull.addOption(
    p.createPluginDynamicOption(
      pull,
      '-s, --secret-name <string>',
      (_helpCfg, pluginCfg) => {
        const cfg = coerceSecretsPluginConfig(pluginCfg);
        const def = cfg.secretName ?? '$STACK_NAME';
        return `secret name (supports $VAR expansion) (default: ${def})`;
      },
    ),
  );

  pull.addOption(
    p.createPluginDynamicOption(
      pull,
      '-t, --template-extension <string>',
      (_helpCfg, pluginCfg) => {
        const cfg = coerceSecretsPluginConfig(pluginCfg);
        const def = cfg.templateExtension ?? 'template';
        return `dotenv template extension used when target file is missing (default: ${def})`;
      },
    ),
  );

  pull.addOption(
    p.createPluginDynamicOption(
      pull,
      '--to <scope:privacy>',
      (_helpCfg, pluginCfg) => {
        const cfg = coerceSecretsPluginConfig(pluginCfg);
        const def = cfg.pull?.to ?? 'env:private';
        return `destination dotenv selector (global|env):(public|private) (default: ${def})`;
      },
    ),
  );

  pull.addOption(
    p
      .createPluginDynamicOption(
        pull,
        '-e, --exclude <strings...>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const { excludeDefault } = describeConfigKeyListDefaults({
            cfgInclude: cfg.pull?.include,
            cfgExclude: cfg.pull?.exclude,
          });
          return `space-delimited list of keys to exclude from the pulled secret (default: ${excludeDefault})`;
        },
      )
      .conflicts('include'),
  );

  pull.addOption(
    p
      .createPluginDynamicOption(
        pull,
        '-i, --include <strings...>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const { includeDefault } = describeConfigKeyListDefaults({
            cfgInclude: cfg.pull?.include,
            cfgExclude: cfg.pull?.exclude,
          });
          return `space-delimited list of keys to include from the pulled secret (default: ${includeDefault})`;
        },
      )
      .conflicts('exclude'),
  );

  pull.action(async (opts: PullOpts, command: ReadMergedOptionsCommand) => {
    const logger = console;
    const ctx = c.getCtx();
    const bag = readMergedOptions(command) as Record<string, unknown>;
    const cfg = coerceSecretsPluginConfig(p.readConfig(c));

    const paths = (bag.paths as string[] | undefined) ?? ['./'];
    const dotenvToken = (bag.dotenvToken as string | undefined) ?? '.env';
    const privateToken = (bag.privateToken as string | undefined) ?? 'local';

    const toRaw = opts.to ?? cfg.pull?.to ?? 'env:private';
    const to = parseToSelector(toRaw);

    const envMaybe = bag.env ?? bag.defaultEnv;
    const env =
      to.scope === 'env'
        ? requireString(envMaybe, 'env is required (use --env or defaultEnv).')
        : undefined;

    const envRef = buildExpansionEnv(ctx.dotenv);
    const secretNameRaw = opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
    const secretId = expandSecretName(secretNameRaw, envRef);
    if (!secretId) throw new Error('secret-name is required.');

    const region = ctx.plugins?.aws?.region;
    const tools = await AwsSecretsManagerTools.init({
      clientConfig: region ? { region, logger } : { logger },
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

    const res = await editDotenvFile(secrets, {
      paths,
      scope: to.scope,
      privacy: to.privacy,
      ...(to.scope === 'env' ? { env: env as string } : {}),
      dotenvToken,
      privateToken,
      templateExtension:
        opts.templateExtension ?? cfg.templateExtension ?? 'template',
    });

    logger.info(`Updated ${res.path}`);
  });
};
