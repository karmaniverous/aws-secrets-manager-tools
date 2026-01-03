/**
 * Requirements addressed:
 * - Support safe plugin defaults from get-dotenv config under `plugins['aws/secrets']`
 *   using a schema-typed config (no casts required at call sites).
 * - CLI flags override config defaults.
 * - include/exclude are mutually exclusive; unknown keys are ignored at filter time.
 */

import { z } from '@karmaniverous/get-dotenv/cliHost';

export const secretsPluginConfigSchema = z.object({
  /**
   * Default secret name for all `aws secrets` subcommands.
   *
   * Supports `$VAR` expansion at action time against `{ ...process.env, ...ctx.dotenv }`.
   */
  secretName: z.string().optional(),
  /**
   * Default template extension used by `aws secrets pull` when the destination
   * dotenv file is missing (e.g. `.env.local.template` -\> `.env.local`).
   */
  templateExtension: z.string().optional(),
  /**
   * Defaults for `aws secrets push`.
   */
  push: z
    .object({
      /**
       * Default provenance selectors for determining which loaded keys are
       * included in the secret payload.
       *
       * When omitted, the CLI default is `file:env:private`.
       */
      from: z.array(z.string()).optional(),
      /**
       * Default include list applied after provenance selection.
       *
       * Mutually exclusive with `push.exclude`.
       */
      include: z.array(z.string()).optional(),
      /**
       * Default exclude list applied after provenance selection.
       *
       * Mutually exclusive with `push.include`.
       */
      exclude: z.array(z.string()).optional(),
    })
    .optional(),
  /**
   * Defaults for `aws secrets pull`.
   */
  pull: z
    .object({
      /**
       * Default destination selector for `aws secrets pull`.
       *
       * Format: `(global|env):(public|private)`, e.g. `env:private`.
       */
      to: z.string().optional(),
      /**
       * Default include list applied to pulled keys before editing the target
       * dotenv file.
       *
       * Mutually exclusive with `pull.exclude`.
       */
      include: z.array(z.string()).optional(),
      /**
       * Default exclude list applied to pulled keys before editing the target
       * dotenv file.
       *
       * Mutually exclusive with `pull.include`.
       */
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
