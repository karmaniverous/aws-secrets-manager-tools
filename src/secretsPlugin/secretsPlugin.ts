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
 * - `push` selects payload keys from `ctx.dotenv` using the effective (last)
 *   provenance entry in `ctx.dotenvProvenance` and repeatable `--from` selectors
 *   (default: `file:env:private`), then narrows with include/exclude.
 * - `pull` targets destination dotenv via `--to <scope>:<privacy>`
 *   (default: `env:private`) and supports include/exclude filtering.
 * - CLI overrides config defaults for include/exclude.
 */

import { Buffer } from 'node:buffer';

import { editDotenvFile } from '@karmaniverous/get-dotenv';
import {
  definePlugin,
  readMergedOptions,
} from '@karmaniverous/get-dotenv/cliHost';

import { AwsSecretsManagerTools } from '../secretsManager/AwsSecretsManagerTools';
import {
  type DotenvProvenance,
  parseFromSelector,
  parseToSelector,
  selectEnvByProvenance,
} from './provenanceSelectors';
import {
  coerceSecretsPluginConfig,
  resolveIncludeExclude,
} from './secretsPluginConfig';
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
  dotenvProvenance?: DotenvProvenance;
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

const assertBytesWithinSecretsManagerLimit = (value: unknown): void => {
  const s = JSON.stringify(value);
  const bytes = Buffer.byteLength(s, 'utf8');
  if (bytes > 65_536) {
    throw new Error(
      `SecretString size ${String(bytes)} bytes exceeds 65536 bytes; narrow selection with --from/--include/--exclude.`,
    );
  }
};

/**
 * get-dotenv plugin that provides `aws secrets pull|push|delete`.
 *
 * Intended usage: mount under `awsPlugin().use(secretsPlugin())`.
 */
export const secretsPlugin = () => {
  const plugin = definePlugin({
    ns: 'secrets',
    setup(cli) {
      cli.description('AWS Secrets Manager helpers (env-map secrets).');

      const describeDefault = (v: unknown): string => {
        if (Array.isArray(v)) return v.length ? v.join(' ') : 'none';
        if (typeof v === 'string' && v.trim()) return v;
        return 'none';
      };

      const describeConfigKeyListDefaults = ({
        cfgInclude,
        cfgExclude,
      }: {
        cfgInclude?: string[];
        cfgExclude?: string[];
      }): { includeDefault: string; excludeDefault: string } => {
        // Avoid throwing in help rendering: show an explicit invalid marker.
        if (cfgInclude?.length && cfgExclude?.length) {
          const msg = '(invalid: both set in config)';
          return { includeDefault: msg, excludeDefault: msg };
        }

        return {
          includeDefault: describeDefault(
            cfgExclude?.length ? undefined : cfgInclude,
          ),
          excludeDefault: describeDefault(
            cfgInclude?.length ? undefined : cfgExclude,
          ),
        };
      };

      const pull = cli
        .command('pull')
        .description(
          'Update local dotenv from a Secrets Manager secret (env-map).',
        );

      const pullSecretNameOpt = plugin.createPluginDynamicOption(
        pull,
        '-s, --secret-name <string>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.secretName ?? '$STACK_NAME';
          return `secret name (supports $VAR expansion) (default: ${def})`;
        },
      );

      const pullTemplateExtensionOpt = plugin.createPluginDynamicOption(
        pull,
        '-t, --template-extension <string>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.templateExtension ?? 'template';
          return `dotenv template extension used when target file is missing (default: ${def})`;
        },
      );

      const pullToOpt = plugin.createPluginDynamicOption(
        pull,
        '--to <scope:privacy>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.pull?.to ?? 'env:private';
          return `destination dotenv selector (global|env):(public|private) (default: ${def})`;
        },
      );

      const pullExcludeOpt = plugin.createPluginDynamicOption(
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
      );
      pullExcludeOpt.conflicts('include');

      const pullIncludeOpt = plugin.createPluginDynamicOption(
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
      );
      pullIncludeOpt.conflicts('exclude');

      pull.action(
        async (
          opts: {
            secretName?: string;
            templateExtension?: string;
            to?: string;
            exclude?: string[];
            include?: string[];
          },
          command,
        ) => {
          const logger = console;
          const ctx = cli.getCtx() as AwsCtx;
          const bag = readMergedOptions(command) as Record<string, unknown>;
          const cfg = coerceSecretsPluginConfig(plugin.readConfig(cli));

          const paths = (bag.paths as string[] | undefined) ?? ['./'];
          const dotenvToken = (bag.dotenvToken as string | undefined) ?? '.env';
          const privateToken =
            (bag.privateToken as string | undefined) ?? 'local';

          const toRaw = opts.to ?? cfg.pull?.to ?? 'env:private';
          const to = parseToSelector(toRaw);

          const envMaybe = bag.env ?? bag.defaultEnv;
          const env =
            to.scope === 'env'
              ? requireString(
                  envMaybe,
                  'env is required (use --env or defaultEnv).',
                )
              : undefined;

          const envRef = buildExpansionEnv(ctx.dotenv);
          const secretNameRaw =
            opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
          const secretId = expandSecretName(secretNameRaw, envRef);
          if (!secretId) throw new Error('secret-name is required.');

          const region = ctx.plugins?.aws?.region;
          const tools = await AwsSecretsManagerTools.init({
            clientConfig: region ? { region, logger } : { logger },
          });

          logger.info(
            `Pulling secret '${secretId}' from AWS Secrets Manager...`,
          );
          const rawSecrets = await tools.readEnvSecret({ secretId });

          const { include, exclude } = resolveIncludeExclude({
            cliInclude: opts.include,
            cliExclude: opts.exclude,
            cfgInclude: cfg.pull?.include,
            cfgExclude: cfg.pull?.exclude,
          });
          const secrets = applyIncludeExclude(rawSecrets, {
            include,
            exclude,
          });

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
        },
      );

      const push = cli
        .command('push')
        .description(
          'Create or update a Secrets Manager secret from selected loaded keys.',
        );

      const pushSecretNameOpt = plugin.createPluginDynamicOption(
        push,
        '-s, --secret-name <string>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.secretName ?? '$STACK_NAME';
          return `secret name (supports $VAR expansion) (default: ${def})`;
        },
      );

      const pushFromOpt = plugin.createPluginDynamicOption(
        push,
        '--from <selectors...>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.push?.from?.length
            ? cfg.push.from
            : ['file:env:private'];
          return `provenance selectors for secret payload keys (default: ${describeDefault(def)})`;
        },
      );

      const pushExcludeOpt = plugin.createPluginDynamicOption(
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
      );
      pushExcludeOpt.conflicts('include');

      const pushIncludeOpt = plugin.createPluginDynamicOption(
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
      );
      pushIncludeOpt.conflicts('exclude');

      push.action(async (opts) => {
        const logger = console;
        const ctx = cli.getCtx() as AwsCtx;
        const cfg = coerceSecretsPluginConfig(plugin.readConfig(cli));

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
        const secretNameRaw =
          opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
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
        const mode = await tools.upsertEnvSecret({
          secretId,
          value: secrets,
        });
        logger.info(mode === 'created' ? 'Created.' : 'Updated.');
      });

      const del = cli
        .command('delete')
        .description(
          'Delete a Secrets Manager secret (recoverable by default).',
        );

      const delSecretNameOpt = plugin.createPluginDynamicOption(
        del,
        '-s, --secret-name <string>',
        (_helpCfg, pluginCfg) => {
          const cfg = coerceSecretsPluginConfig(pluginCfg);
          const def = cfg.secretName ?? '$STACK_NAME';
          return `secret name (supports $VAR expansion) (default: ${def})`;
        },
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

      del.action(
        async (opts: {
          secretName?: string;
          recoveryWindowDays?: string;
          force?: boolean;
        }) => {
          const logger = console;
          const ctx = cli.getCtx() as AwsCtx;
          const cfg = coerceSecretsPluginConfig(plugin.readConfig(cli));

          const envRef = buildExpansionEnv(ctx.dotenv);
          const secretNameRaw =
            opts.secretName ?? cfg.secretName ?? '$STACK_NAME';
          const secretId = expandSecretName(secretNameRaw, envRef);
          if (!secretId) throw new Error('secret-name is required.');

          const recoveryWindowInDays = toNumber(opts.recoveryWindowDays);

          const region = ctx.plugins?.aws?.region;
          const tools = await AwsSecretsManagerTools.init({
            clientConfig: region ? { region, logger } : { logger },
          });

          logger.info(
            `Deleting secret '${secretId}' from AWS Secrets Manager...`,
          );
          await tools.deleteSecret({
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

  return plugin;
};
