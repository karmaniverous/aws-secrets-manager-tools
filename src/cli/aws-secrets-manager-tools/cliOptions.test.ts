import { describe, expect, it } from 'vitest';

import { createAwsSecretsCliOptions } from './cliOptions';

describe('createAwsSecretsCliOptions', () => {
  it('passes the host importMetaUrl to get-dotenv', () => {
    const importMetaUrl = 'file:///package/dist/cli/run.js';
    const options = createAwsSecretsCliOptions(importMetaUrl);

    expect(options.alias).toBe('aws-secrets-manager-tools');
    expect(options.importMetaUrl).toBe(importMetaUrl);
    expect(options.compose).toBeTypeOf('function');
  });
});
