import { describe, expect, it } from 'vitest';

import {
  resolveIncludeExclude,
  secretsPluginConfigSchema,
} from './secretsPluginConfig';

describe('secretsPluginConfig', () => {
  it('parses safe plugin config fields via schema', () => {
    const cfg = secretsPluginConfigSchema.parse({
      secretName: 'x',
      templateExtension: 'template',
      push: { from: ['file:env:private'], include: ['A'] },
      pull: { to: 'env:private', exclude: ['B'] },
    });
    expect(cfg.secretName).toBe('x');
    expect(cfg.push?.from).toEqual(['file:env:private']);
    expect(cfg.pull?.to).toBe('env:private');
  });

  it('ignores unknown keys via schema (strip default)', () => {
    const cfg = secretsPluginConfigSchema.parse({
      secretName: 'x',
      unknownKey: 'nope',
    });
    expect(Object.prototype.hasOwnProperty.call(cfg, 'unknownKey')).toBe(false);
  });

  it('CLI include overrides config exclude (and config is ignored)', () => {
    const res = resolveIncludeExclude({
      cliInclude: ['A'],
      cfgExclude: ['B'],
    });
    expect(res).toEqual({ include: ['A'], exclude: undefined });
  });

  it('CLI exclude overrides config include (and config is ignored)', () => {
    const res = resolveIncludeExclude({
      cliExclude: ['B'],
      cfgInclude: ['A'],
    });
    expect(res).toEqual({ include: undefined, exclude: ['B'] });
  });

  it('throws when include and exclude are both present', () => {
    expect(() =>
      resolveIncludeExclude({ cfgInclude: ['A'], cfgExclude: ['B'] }),
    ).toThrow('--exclude and --include are mutually exclusive.');
  });
});
