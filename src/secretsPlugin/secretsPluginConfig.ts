/**
 * Requirements addressed:
 * - Support safe plugin defaults from get-dotenv config under `plugins['aws/secrets']`.
 * - CLI flags override config defaults.
 * - include/exclude are mutually exclusive; unknown keys are ignored at filter time.
 */

export type SecretsPluginConfig = {
  secretName?: string;
  templateExtension?: string;
  push?: {
    from?: string[];
    include?: string[];
    exclude?: string[];
  };
  pull?: {
    to?: string;
    include?: string[];
    exclude?: string[];
  };
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

const readObj = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;

export const coerceSecretsPluginConfig = (v: unknown): SecretsPluginConfig => {
  const o = readObj(v);
  if (!o) return {};

  const push = readObj(o.push);
  const pull = readObj(o.pull);

  return {
    ...(typeof o.secretName === 'string' ? { secretName: o.secretName } : {}),
    ...(typeof o.templateExtension === 'string'
      ? { templateExtension: o.templateExtension }
      : {}),
    ...(push
      ? {
          push: {
            ...(isStringArray(push.from) ? { from: push.from } : {}),
            ...(isStringArray(push.include) ? { include: push.include } : {}),
            ...(isStringArray(push.exclude) ? { exclude: push.exclude } : {}),
          },
        }
      : {}),
    ...(pull
      ? {
          pull: {
            ...(typeof pull.to === 'string' ? { to: pull.to } : {}),
            ...(isStringArray(pull.include) ? { include: pull.include } : {}),
            ...(isStringArray(pull.exclude) ? { exclude: pull.exclude } : {}),
          },
        }
      : {}),
  };
};

export const resolveIncludeExclude = ({
  cliInclude,
  cliExclude,
  cfgInclude,
  cfgExclude,
}: {
  cliInclude?: string[];
  cliExclude?: string[];
  cfgInclude?: string[];
  cfgExclude?: string[];
}): { include?: string[]; exclude?: string[] } => {
  // CLI overrides config: if either include/exclude is provided on CLI, ignore
  // config’s include/exclude entirely.
  const include = cliInclude ?? (cliExclude ? undefined : cfgInclude);
  const exclude = cliExclude ?? (cliInclude ? undefined : cfgExclude);

  if (include?.length && exclude?.length) {
    throw new Error('--exclude and --include are mutually exclusive.');
  }

  return { include, exclude };
};
