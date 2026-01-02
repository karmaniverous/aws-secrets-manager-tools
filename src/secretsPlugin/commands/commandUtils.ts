/**
 * Requirements addressed:
 * - Enforce AWS Secrets Manager SecretString size limits (65,536 bytes).
 * - Provide safe parsing helpers for CLI-mapped inputs.
 * - Render config-derived defaults in dynamic option help text.
 */

import { Buffer } from 'node:buffer';

export const requireString = (v: unknown, msg: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(msg);
  return v;
};

export const toNumber = (v: unknown): number | undefined => {
  if (typeof v === 'undefined') return;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim()) return Number(v);
  return;
};

export const assertBytesWithinSecretsManagerLimit = (value: unknown): void => {
  const s = JSON.stringify(value);
  const bytes = Buffer.byteLength(s, 'utf8');
  if (bytes > 65_536) {
    throw new Error(
      `SecretString size ${String(bytes)} bytes exceeds 65536 bytes; narrow selection with --from/--include/--exclude.`,
    );
  }
};

export const describeDefault = (v: unknown): string => {
  if (Array.isArray(v)) return v.length ? v.join(' ') : 'none';
  if (typeof v === 'string' && v.trim()) return v;
  return 'none';
};

export const describeConfigKeyListDefaults = ({
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
