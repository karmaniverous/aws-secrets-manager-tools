/**
 * Requirements addressed:
 * - Secret name expansion expands against `{ ...process.env, ...ctx.dotenv }`.
 * - include/exclude ignore unknown keys; use radash (no lodash).
 */

import { dotenvExpand } from '@karmaniverous/get-dotenv';
import { omit, pick } from 'radash';

import type { EnvSecretMap } from '../secretsManager/envSecretMap';

export const buildExpansionEnv = (
  ctxDotenv: Record<string, string | undefined>,
): Record<string, string | undefined> => ({
  ...process.env,
  ...ctxDotenv,
});

export const expandSecretName = (
  raw: string,
  envRef: Record<string, string | undefined>,
): string => dotenvExpand(raw, envRef) ?? raw;

export const applyIncludeExclude = (
  env: EnvSecretMap,
  {
    include,
    exclude,
  }: {
    include?: string[];
    exclude?: string[];
  },
): EnvSecretMap => {
  let out: EnvSecretMap = env;
  if (exclude?.length) out = omit(out, exclude);
  if (include?.length) out = pick(out, include);
  return out;
};
