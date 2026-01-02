/**
 * Requirements addressed:
 * - `push` selects a subset of `ctx.dotenv` keys using `ctx.dotenvProvenance`,
 *   matching only the effective provenance entry (last entry for a key).
 * - `push` supports repeatable `--from <selector...>` with grammar:
 *   - file:<scope>:<privacy> (scope: global|env|*; privacy: public|private|*)
 *   - config:<configScope>:<scope>:<privacy> (configScope: packaged|project|*)
 *   - dynamic:<dynamicSource> (dynamicSource: config|programmatic|dynamicPath|*)
 *   - vars
 * - `pull` uses `--to <scope>:<privacy>` (scope: global|env; privacy: public|private).
 * - No path-based selector matching is supported.
 */

import type { EnvSecretMap } from '../secretsManager/envSecretMap';

export type DotenvProvenanceEntry = {
  kind: 'file';
  scope: 'global' | 'env';
  privacy: 'public' | 'private';
  path?: string;
  op?: 'unset';
};

export type DotenvProvenanceConfigEntry = {
  kind: 'config';
  configScope: 'packaged' | 'project';
  scope: 'global' | 'env';
  privacy: 'public' | 'private';
  op?: 'unset';
};

export type DotenvProvenanceVarsEntry = {
  kind: 'vars';
  op?: 'unset';
};

export type DotenvProvenanceDynamicEntry = {
  kind: 'dynamic';
  dynamicSource: 'config' | 'programmatic' | 'dynamicPath';
  op?: 'unset';
};

export type DotenvProvenanceAnyEntry =
  | DotenvProvenanceEntry
  | DotenvProvenanceConfigEntry
  | DotenvProvenanceVarsEntry
  | DotenvProvenanceDynamicEntry;

export type DotenvProvenance = Record<string, DotenvProvenanceAnyEntry[]>;

export type FromSelector =
  | {
      kind: 'file';
      scope: 'global' | 'env' | '*';
      privacy: 'public' | 'private' | '*';
    }
  | {
      kind: 'config';
      configScope: 'packaged' | 'project' | '*';
      scope: 'global' | 'env' | '*';
      privacy: 'public' | 'private' | '*';
    }
  | {
      kind: 'dynamic';
      dynamicSource: 'config' | 'programmatic' | 'dynamicPath' | '*';
    }
  | { kind: 'vars' };

export type ToSelector = {
  scope: 'global' | 'env';
  privacy: 'public' | 'private';
};

const isOneOf = <T extends string>(v: string, allowed: readonly T[]): v is T =>
  (allowed as readonly string[]).includes(v);

const parseParts = (raw: string): string[] =>
  raw
    .split(':')
    .map((p) => p.trim())
    .filter(Boolean);

export const parseFromSelector = (raw: string): FromSelector => {
  const parts = parseParts(raw);
  const kind = parts[0];

  if (parts.length === 1 && kind === 'vars') return { kind: 'vars' };

  if (kind === 'file') {
    if (parts.length !== 3) throw new Error(`Invalid --from selector: ${raw}`);
    const scope = parts[1];
    const privacy = parts[2];
    if (
      !isOneOf(scope, ['global', 'env', '*'] as const) ||
      !isOneOf(privacy, ['public', 'private', '*'] as const)
    ) {
      throw new Error(`Invalid --from selector: ${raw}`);
    }
    return { kind: 'file', scope, privacy };
  }

  if (kind === 'config') {
    if (parts.length !== 4) throw new Error(`Invalid --from selector: ${raw}`);
    const configScope = parts[1];
    const scope = parts[2];
    const privacy = parts[3];
    if (
      !isOneOf(configScope, ['packaged', 'project', '*'] as const) ||
      !isOneOf(scope, ['global', 'env', '*'] as const) ||
      !isOneOf(privacy, ['public', 'private', '*'] as const)
    ) {
      throw new Error(`Invalid --from selector: ${raw}`);
    }
    return { kind: 'config', configScope, scope, privacy };
  }

  if (kind === 'dynamic') {
    if (parts.length !== 2) throw new Error(`Invalid --from selector: ${raw}`);
    const dynamicSource = parts[1];
    if (
      !isOneOf(dynamicSource, [
        'config',
        'programmatic',
        'dynamicPath',
        '*',
      ] as const)
    ) {
      throw new Error(`Invalid --from selector: ${raw}`);
    }
    return { kind: 'dynamic', dynamicSource };
  }

  throw new Error(`Invalid --from selector: ${raw}`);
};

export const parseToSelector = (raw: string): ToSelector => {
  const parts = parseParts(raw);
  if (parts.length !== 2) throw new Error(`Invalid --to selector: ${raw}`);
  const scope = parts[0];
  const privacy = parts[1];
  if (
    !isOneOf(scope, ['global', 'env'] as const) ||
    !isOneOf(privacy, ['public', 'private'] as const)
  ) {
    throw new Error(`Invalid --to selector: ${raw}`);
  }
  return { scope, privacy };
};

const wildcardMatch = (v: string, sel: string): boolean =>
  sel === '*' || v === sel;

export const getEffectiveProvenanceEntry = (
  entries: DotenvProvenanceAnyEntry[] | undefined,
): DotenvProvenanceAnyEntry | undefined =>
  entries && entries.length ? entries[entries.length - 1] : undefined;

export const matchesFromSelector = (
  entry: DotenvProvenanceAnyEntry,
  sel: FromSelector,
): boolean => {
  if (entry.kind !== sel.kind) return false;

  if (sel.kind === 'vars') return true;

  if (sel.kind === 'dynamic') {
    const e = entry as DotenvProvenanceDynamicEntry;
    return wildcardMatch(e.dynamicSource, sel.dynamicSource);
  }

  if (sel.kind === 'file') {
    const e = entry as DotenvProvenanceEntry;
    return (
      wildcardMatch(e.scope, sel.scope) && wildcardMatch(e.privacy, sel.privacy)
    );
  }

  const e = entry as DotenvProvenanceConfigEntry;
  return (
    wildcardMatch(e.configScope, sel.configScope) &&
    wildcardMatch(e.scope, sel.scope) &&
    wildcardMatch(e.privacy, sel.privacy)
  );
};

/**
 * Select env values for a secret payload using provenance selectors.
 *
 * Notes:
 * - Iterates keys from provenance (not from dotenv), so keys lacking provenance
 *   are excluded by default.
 * - Uses only the effective entry (last entry) for matching.
 * - Excludes keys whose effective value is undefined, or whose effective entry
 *   has `op: 'unset'`.
 */
export const selectEnvByProvenance = (
  dotenv: Record<string, string | undefined>,
  provenance: DotenvProvenance,
  selectors: FromSelector[],
): EnvSecretMap => {
  const out: EnvSecretMap = {};

  for (const [key, entries] of Object.entries(provenance)) {
    const value = dotenv[key];
    if (typeof value === 'undefined') continue;

    const effective = getEffectiveProvenanceEntry(entries);
    if (!effective) continue;
    if (effective.op === 'unset') continue;

    if (selectors.some((s) => matchesFromSelector(effective, s))) {
      out[key] = value;
    }
  }

  return out;
};
