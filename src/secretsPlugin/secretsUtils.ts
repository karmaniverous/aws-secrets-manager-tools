/**
 * Requirements addressed:
 * - Secret name expansion expands against `{ ...process.env, ...ctx.dotenv }`.
 * - include/exclude ignore unknown keys; use radash (no lodash).
 */

import { type ProcessEnv } from '@karmaniverous/get-dotenv';
import { omit, pick } from 'radash';

export const applyIncludeExclude = (
  env: ProcessEnv,
  {
    include,
    exclude,
  }: {
    include?: string[];
    exclude?: string[];
  },
): ProcessEnv => {
  let out: ProcessEnv = env;
  if (exclude?.length) out = omit(out, exclude);
  if (include?.length) out = pick(out, include);
  return out;
};
