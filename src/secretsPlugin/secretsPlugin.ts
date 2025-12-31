/**
 * Requirements addressed:
 * - Provide get-dotenv plugin mounted as `aws secrets` with commands:
 *   - `aws secrets pull`
 *   - `aws secrets push`
 *   - `aws secrets delete`
 * - Use get-dotenv precedence (“winner path”) for dotenv editing.
 * - Expand secret name against `{ ...process.env, ...ctx.dotenv }`.
 * - Region is sourced from aws plugin context.
 * - Safer delete defaults; require `--force` for no-recovery delete.
 * - include/exclude ignore unknown keys; use radash (no lodash).
 */

import { editDotenvFile, getDotenv } from '@karmaniverous/get-dotenv';
import {
  definePlugin,
  readMergedOptions,
} from '@karmaniverous/get-dotenv/cliHost';

import { AwsSecretsManagerClient } from '../secretsManager/AwsSecretsManagerClient';
import type { EnvSecretMap } from '../secretsManager/envSecretMap';
import {
  applyIncludeExclude,
  buildExpansionEnv,
  expandSecretName,
} from './secretsUtils';

type AwsCtx = {
  plugins?: {
    aws?: {
      region?: string;
    };
  };
  dotenv: Record<string, string | undefined>;
};

const requireString = (v: unknown, msg: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(msg);
  return v;
};

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === 'undefined') return;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim()) return Number(v);
  return;
};

export const secretsPlugin = () =>
  definePlugin({
    ns: 'secrets',
    setup(cli) {
      cli.description('AWS Secrets Manager helpers (env-map secrets).');

      cli
        .command('pull')
        .description(
          'Update local private dotenv from a Secrets Manager secret.',
        )
        .option(
          '-s, --secret-name <string>',
          'secret name (supports $VAR expansion)',
          '$STACK_NAME',
        )
        .option(
          '-t, --template-extension <string>',
          'dotenv template extension used when target file is missing',
          'template',
        )
        .action(
          async (
            opts: { secretName: string; templateExtension: string },
            command,
          ) => {
            const logger = console;
            const ctx = cli.getCtx() as AwsCtx;
            const bag = readMergedOptions(command) as Record<string, unknown>;

            const env = requireString(
              bag.env ?? bag.defaultEnv,
              'env is required (use --env or defaultEnv).',
            );
            const paths = (bag.paths as string[] | undefined) ?? ['./'];
            const dotenvToken =
              (bag.dotenvToken as string | undefined) ?? '.env';
            const privateToken =
              (bag.privateToken as string | undefined) ?? 'local';

            const envRef = buildExpansionEnv(ctx.dotenv);
            const secretId = expandSecretName(String(opts.secretName), envRef);
            if (!secretId) throw new Error('secret-name is required.');

            const region = ctx.plugins?.aws?.region;
            const sm = new AwsSecretsManagerClient({ region, logger });

            logger.info(
              `Pulling secret '${secretId}' from AWS Secrets Manager...`,
            );
            const secrets = await sm.getEnvSecret({ secretId });

            const res = await editDotenvFile(secrets, {
              paths,
              scope: 'env',
              privacy: 'private',
              env,
              dotenvToken,
              privateToken,
              templateExtension: opts.templateExtension,
            });

            logger.info(`Updated ${res.path}`);
          },
        );

      cli
        .command('push')
        .description(
          'Create or update a Secrets Manager secret from local private dotenv.',
        )
        .option(
          '-s, --secret-name <string>',
          'secret name (supports $VAR expansion)',
          '$STACK_NAME',
        )
        .option(
          '-e, --exclude <strings...>',
          'space-delimited list of environment variables to exclude (conflicts with --include)',
        )
        .option(
          '-i, --include <strings...>',
          'space-delimited list of environment variables to include (conflicts with --exclude)',
        )
        .action(
          async (
            opts: {
              secretName: string;
              exclude?: string[];
              include?: string[];
            },
            command,
          ) => {
            const logger = console;
            const ctx = cli.getCtx() as AwsCtx;
            const bag = readMergedOptions(command) as Record<string, unknown>;

            if (opts.exclude?.length && opts.include?.length) {
              throw new Error(
                '--exclude and --include are mutually exclusive.',
              );
            }

            const env = requireString(
              bag.env ?? bag.defaultEnv,
              'env is required (use --env or defaultEnv).',
            );
            const paths = (bag.paths as string[] | undefined) ?? ['./'];
            const dotenvToken =
              (bag.dotenvToken as string | undefined) ?? '.env';
            const privateToken =
              (bag.privateToken as string | undefined) ?? 'local';

            const envRef = buildExpansionEnv(ctx.dotenv);
            const secretId = expandSecretName(String(opts.secretName), envRef);
            if (!secretId) throw new Error('secret-name is required.');

            // Compose local secrets from the private env file only:
            // - private: true, env: true
            // - exclude public and global
            // - exclude dynamic so we only push file-backed secrets
            const raw = await getDotenv({
              env,
              paths,
              dotenvToken,
              privateToken,
              excludeDynamic: true,
              excludeEnv: false,
              excludeGlobal: true,
              excludePublic: true,
              excludePrivate: false,
            });

            const secrets = applyIncludeExclude(raw, {
              include: opts.include,
              exclude: opts.exclude,
            });

            const region = ctx.plugins?.aws?.region;
            const sm = new AwsSecretsManagerClient({ region, logger });

            logger.info(
              `Pushing secret '${secretId}' to AWS Secrets Manager...`,
            );
            const mode = await sm.putOrCreateEnvSecret({
              secretId,
              value: secrets,
            });
            logger.info(mode === 'created' ? 'Created.' : 'Updated.');
          },
        );

      cli
        .command('delete')
        .description(
          'Delete a Secrets Manager secret (recoverable by default).',
        )
        .option(
          '-s, --secret-name <string>',
          'secret name (supports $VAR expansion)',
          '$STACK_NAME',
        )
        .option(
          '--recovery-window-days <number>',
          'recovery window in days (omit to use AWS default)',
        )
        .option('--force', 'force delete without recovery (DANGEROUS)', false)
        .action(
          async (
            opts: {
              secretName: string;
              recoveryWindowDays?: string;
              force: boolean;
            },
            command,
          ) => {
            const logger = console;
            const ctx = cli.getCtx() as AwsCtx;
            const bag = readMergedOptions(command) as Record<string, unknown>;

            const envRef = buildExpansionEnv(ctx.dotenv);
            const secretId = expandSecretName(String(opts.secretName), envRef);
            if (!secretId) throw new Error('secret-name is required.');

            const recoveryWindowInDays = toNumber(opts.recoveryWindowDays);
            if (opts.force && typeof recoveryWindowInDays === 'number') {
              throw new Error('--force conflicts with --recovery-window-days.');
            }

            const region = ctx.plugins?.aws?.region;
            const sm = new AwsSecretsManagerClient({ region, logger });

            logger.info(
              `Deleting secret '${secretId}' from AWS Secrets Manager...`,
            );
            await sm.deleteSecret({
              secretId,
              ...(opts.force
                ? { forceDeleteWithoutRecovery: true }
                : typeof recoveryWindowInDays === 'number'
                  ? { recoveryWindowInDays }
                  : {}),
            });
            logger.info('Done.');
          },
        );
    },
  });
