/**
 * Requirements addressed:
 * - Provide `aws secrets delete`.
 * - Require `--force` for delete-without-recovery; otherwise use recoverable
 *   deletion and do not set RecoveryWindowInDays unless explicitly provided.
 * - For config-backed plugin options, use plugin dynamic options to show
 *   composed defaults in help output.
 */

import { AwsSecretsManagerTools } from '../../secretsManager/AwsSecretsManagerTools';
import { coerceSecretsPluginConfig } from '../secretsPluginConfig';
import { buildExpansionEnv, expandSecretName } from '../secretsUtils';
import { toNumber } from './commandUtils';
import type { SecretsPluginApi, SecretsPluginCli } from './types';

type DeleteOpts = {
  secretName?: string;
  recoveryWindowDays?: string;
  force?: boolean;
};

export const registerDeleteCommand = ({
  cli,
  plugin,
}: {
  cli: unknown;
  plugin: unknown;
}): void => {
  const c = cli as SecretsPluginCli;
  const p = plugin as SecretsPluginApi;

  const del = c
    .command('delete')
    .description('Delete a Secrets Manager secret (recoverable by default).');

  del.addOption(
    p.createPluginDynamicOption(
      del,
      '-s, --secret-name <string>',
      (_helpCfg, pluginCfg) => {
        const cfg = coerceSecretsPluginConfig(pluginCfg);
        const def = cfg.secretName ?? '$STACK_NAME';
        return `secret name (supports $VAR expansion) (default: ${def})`;
      },
    ),
  );

  const delRecoveryOpt = del
    .createOption(
      '--recovery-window-days <number>',
      'recovery window in days (omit to use AWS default)',
    )
    .conflicts('force');
  del.addOption(delRecoveryOpt);

  const delForceOpt = del
    .createOption('--force', 'force delete without recovery (DANGEROUS)')
    .conflicts('recoveryWindowDays')
    .default(false);
  del.addOption(delForceOpt);

  del.action(async (...args: unknown[]) => {
    const [opts] = args as [DeleteOpts];

    const logger = console;
    const ctx = c.getCtx();
    const cfg = coerceSecretsPluginConfig(p.readConfig(c));

    const envRef = buildExpansionEnv(ctx.dotenv);
    const secretNameRaw = opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
    const secretId = expandSecretName(secretNameRaw, envRef);
    if (!secretId) throw new Error('secret-name is required.');

    const recoveryWindowInDays = toNumber(opts.recoveryWindowDays);

    const region = ctx.plugins?.aws?.region;
    const tools = await AwsSecretsManagerTools.init({
      clientConfig: region ? { region, logger } : { logger },
    });

    logger.info(`Deleting secret '${secretId}' from AWS Secrets Manager...`);
    await tools.deleteSecret({
      secretId,
      ...(opts.force
        ? { forceDeleteWithoutRecovery: true }
        : typeof recoveryWindowInDays === 'number'
          ? { recoveryWindowInDays }
          : {}),
    });
    logger.info('Done.');
  });
};
