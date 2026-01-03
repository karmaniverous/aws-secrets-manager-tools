/**
 * Requirements addressed:
 * - Support safe plugin defaults from get-dotenv config under `plugins['aws/secrets']`
 *   using a schema-typed config (no casts required at call sites).
 * - CLI flags override config defaults.
 * - include/exclude are mutually exclusive; unknown keys are ignored at filter time.
 */

import { z } from '@karmaniverous/get-dotenv/cliHost';

export const secretsPluginConfigSchema = z.object({
  secretName: z.string().optional(),
  templateExtension: z.string().optional(),
  push: z
    .object({
      from: z.array(z.string()).optional(),
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
  pull: z
    .object({
      to: z.string().optional(),
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
});

export type SecretsPluginConfig = z.output<typeof secretsPluginConfigSchema>;

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
