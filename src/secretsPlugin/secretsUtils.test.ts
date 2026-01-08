import { describe, expect, it } from 'vitest';

import { applyIncludeExclude } from './secretsUtils';

describe('secretsUtils', () => {
  it('applyIncludeExclude ignores unknown keys', () => {
    const base = { A: '1', B: '2' };
    const next = applyIncludeExclude(base, {
      exclude: ['NOPE'],
      include: ['A', 'NOPE2'],
    });
    expect(next).toEqual({ A: '1' });
  });
});
