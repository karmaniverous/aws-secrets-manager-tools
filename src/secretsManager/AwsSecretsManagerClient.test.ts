import { describe, expect, it, vi } from 'vitest';

import { AwsSecretsManagerClient } from './AwsSecretsManagerClient';

describe('AwsSecretsManagerClient', () => {
  it('parses a JSON object env map (null -> undefined)', async () => {
    const client = {
      send: vi.fn(async () => ({
        SecretString: JSON.stringify({ A: '1', B: null }),
      })),
    };

    const sm = new AwsSecretsManagerClient({ client, xray: 'off' });
    await expect(sm.getEnvSecret({ secretId: 'x' })).resolves.toEqual({
      A: '1',
      B: undefined,
    });
  });

  it('rejects non-JSON secrets', async () => {
    const client = {
      send: vi.fn(async () => ({ SecretString: 'not-json' })),
    };

    const sm = new AwsSecretsManagerClient({ client, xray: 'off' });
    await expect(sm.getEnvSecret({ secretId: 'x' })).rejects.toThrow(
      'SecretString is not valid JSON.',
    );
  });

  it('rejects non-object JSON secrets', async () => {
    const client = {
      send: vi.fn(async () => ({ SecretString: JSON.stringify(['nope']) })),
    };

    const sm = new AwsSecretsManagerClient({ client, xray: 'off' });
    await expect(sm.getEnvSecret({ secretId: 'x' })).rejects.toThrow(
      'Secret JSON must be an object map.',
    );
  });

  it('rejects non-string values', async () => {
    const client = {
      send: vi.fn(async () => ({ SecretString: JSON.stringify({ A: 123 }) })),
    };

    const sm = new AwsSecretsManagerClient({ client, xray: 'off' });
    await expect(sm.getEnvSecret({ secretId: 'x' })).rejects.toThrow(
      "Secret JSON value for 'A' must be a string or null.",
    );
  });

  it('putOrCreateEnvSecret only creates on ResourceNotFound', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('nope'), { name: 'ResourceNotFoundException' }),
      )
      .mockResolvedValueOnce({});

    const sm = new AwsSecretsManagerClient({ client: { send }, xray: 'off' });

    await expect(
      sm.putOrCreateEnvSecret({ secretId: 'x', value: { A: '1' } }),
    ).resolves.toBe('created');
  });
});
