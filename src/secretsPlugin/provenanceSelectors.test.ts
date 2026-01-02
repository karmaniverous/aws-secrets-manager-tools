import { describe, expect, it } from 'vitest';

import {
  type DotenvProvenance,
  parseFromSelector,
  parseToSelector,
  selectEnvByProvenance,
} from './provenanceSelectors';

describe('provenanceSelectors', () => {
  it('parses --from selectors (all enumerated kinds)', () => {
    expect(parseFromSelector('file:env:private')).toEqual({
      kind: 'file',
      scope: 'env',
      privacy: 'private',
    });
    expect(parseFromSelector('config:project:env:private')).toEqual({
      kind: 'config',
      configScope: 'project',
      scope: 'env',
      privacy: 'private',
    });
    expect(parseFromSelector('dynamic:dynamicPath')).toEqual({
      kind: 'dynamic',
      dynamicSource: 'dynamicPath',
    });
    expect(parseFromSelector('vars')).toEqual({ kind: 'vars' });
    expect(parseFromSelector('file:*:*')).toEqual({
      kind: 'file',
      scope: '*',
      privacy: '*',
    });
  });

  it('rejects invalid --from selectors', () => {
    expect(() => parseFromSelector('nope')).toThrow('Invalid --from selector');
    expect(() => parseFromSelector('file:env')).toThrow(
      'Invalid --from selector',
    );
    expect(() => parseFromSelector('dynamic:wat')).toThrow(
      'Invalid --from selector',
    );
  });

  it('parses --to selectors (no wildcards)', () => {
    expect(parseToSelector('env:private')).toEqual({
      scope: 'env',
      privacy: 'private',
    });
    expect(parseToSelector('global:public')).toEqual({
      scope: 'global',
      privacy: 'public',
    });
    expect(() => parseToSelector('env:*')).toThrow('Invalid --to selector');
  });

  it('selects by effective provenance entry only', () => {
    const dotenv = { A: '1', B: '2', C: '3', D: undefined };
    const provenance: DotenvProvenance = {
      // Effective: file env private -> included by default selector
      A: [{ kind: 'file', scope: 'env', privacy: 'private' }],
      // Effective: dynamic -> excluded by default selector
      B: [
        { kind: 'file', scope: 'env', privacy: 'private' },
        { kind: 'dynamic', dynamicSource: 'config' },
      ],
      // Effective: file global private -> excluded by default selector
      C: [{ kind: 'file', scope: 'global', privacy: 'private' }],
      // Undefined values are ignored
      D: [{ kind: 'file', scope: 'env', privacy: 'private' }],
      // Unset effective entry is ignored
      E: [{ kind: 'file', scope: 'env', privacy: 'private', op: 'unset' }],
    };

    const selected = selectEnvByProvenance(dotenv, provenance, [
      parseFromSelector('file:env:private'),
    ]);
    expect(selected).toEqual({ A: '1' });
  });
});
