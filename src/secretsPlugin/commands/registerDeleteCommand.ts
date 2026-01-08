/**
 * Requirements addressed:
 * - Provide `aws secrets delete`.
 * - Require `--force` for delete-without-recovery; otherwise use recoverable
 *   deletion and do not set RecoveryWindowInDays unless explicitly provided.
 * - For config-backed plugin options, use plugin dynamic options to show
 *   composed defaults in help output.
 */

import {
  buildSpawnEnv,
  dotenvExpand,
  silentLogger,
  toNumber,
} from '@karmaniverous/get-dotenv';
import { readMergedOptions } from '@karmaniverous/get-dotenv/cliHost';
import { getAwsRegion } from '@karmaniverous/get-dotenv/plugins';

import { AwsSecretsManagerTools } from '../../secretsManager/AwsSecretsManagerTools';
import type { SecretsPluginApi, SecretsPluginCli } from './types';

export const registerDeleteCommand = ({
  cli,
  plugin,
}: {
  cli: SecretsPluginCli;
  plugin: SecretsPluginApi;
}): void => {
  const del = cli
    .ns('delete')
    .description('Delete a Secrets Manager secret (recoverable by default).');

  const delRecoveryOpt = del
    .createOption(
      '--recovery-window-days <number>',
      'recovery window in days (omit to use AWS default)',
    )
    .conflicts('force');

  const delForceOpt = del
    .createOption('--force', 'force delete without recovery (DANGEROUS)')
    .conflicts('recoveryWindowDays')
    .default(false);

  del
    .addOption(
      plugin.createPluginDynamicOption(
        del,
        '-s, --secret-name <string>',
        (_helpCfg, pluginCfg) =>
          `secret name (supports $VAR expansion) (default: ${pluginCfg.secretName ?? '$STACK_NAME'})`,
      ),
    )
    .addOption(delRecoveryOpt)
    .addOption(delForceOpt)
    .action(async (opts) => {
      const bag = readMergedOptions(del);
      const sdkLogger = bag.debug ? console : silentLogger;

      const logger = console;
      const ctx = cli.getCtx();
      const cfg = plugin.readConfig(del);

      const envRef = buildSpawnEnv(process.env, ctx.dotenv);
      const secretNameRaw = opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
      const secretId = dotenvExpand(secretNameRaw, envRef);
      if (!secretId) throw new Error('secret-name is required.');

      const recoveryWindowInDays = toNumber(opts.recoveryWindowDays);

      const region = getAwsRegion(ctx);
      const tools = new AwsSecretsManagerTools({
        clientConfig: region
          ? { region, logger: sdkLogger }
          : { logger: sdkLogger },
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
