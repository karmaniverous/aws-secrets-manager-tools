import { describe, expect, it, vi } from 'vitest';

import { createAwsSecretsCliOptions } from './cliOptions';

describe('createAwsSecretsCliOptions', () => {
  it('passes the host importMetaUrl to get-dotenv', () => {
    const importMetaUrl = 'file:///package/dist/cli/run.js';
    const options = createAwsSecretsCliOptions(importMetaUrl);

    expect(options.alias).toBe('aws-secrets-manager-tools');
    expect(options.importMetaUrl).toBe(importMetaUrl);
    expect(options.compose).toBeTypeOf('function');

    const program = { use: vi.fn() };
    program.use.mockReturnValue(program);

    expect(options.compose?.(program as never)).toBe(program);
    expect(program.use).toHaveBeenCalledTimes(4);
  });
});
