import { describe, expect, it } from 'vitest';

import {
  applyIncludeExclude,
  buildExpansionEnv,
  expandSecretName,
} from './secretsUtils';

describe('secretsUtils', () => {
  it('buildExpansionEnv gives ctx.dotenv precedence over process.env', () => {
    const envRef = buildExpansionEnv({ STACK_NAME: 'from-ctx' });
    expect(envRef.STACK_NAME).toBe('from-ctx');
  });

  it('expands $VAR using the provided envRef', () => {
    const name = expandSecretName('$STACK_NAME', { STACK_NAME: 'stack' });
    expect(name).toBe('stack');
  });

  it('applyIncludeExclude ignores unknown keys', () => {
    const base = { A: '1', B: '2' };
    const next = applyIncludeExclude(base, {
      exclude: ['NOPE'],
      include: ['A', 'NOPE2'],
    });
    expect(next).toEqual({ A: '1' });
  });
});
