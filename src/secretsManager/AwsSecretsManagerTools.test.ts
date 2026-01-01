import { describe, expect, it, vi } from 'vitest';

import { AwsSecretsManagerTools } from './AwsSecretsManagerTools';

type SendableClient = { send: (cmd: unknown) => Promise<unknown> };
const spySend = (tools: AwsSecretsManagerTools) =>
  vi.spyOn(tools.client as unknown as SendableClient, 'send');

describe('AwsSecretsManagerTools', () => {
  it('parses a JSON object env map (null -> undefined)', async () => {
    const tools = await AwsSecretsManagerTools.init({ xray: 'off' });
    spySend(tools).mockResolvedValueOnce({
      SecretString: JSON.stringify({ A: '1', B: null }),
    });

    await expect(tools.readEnvSecret({ secretId: 'x' })).resolves.toEqual({
      A: '1',
      B: undefined,
    });
  });

  it('rejects non-JSON secrets', async () => {
    const tools = await AwsSecretsManagerTools.init({ xray: 'off' });
    spySend(tools).mockResolvedValueOnce({
      SecretString: 'not-json',
    });

    await expect(tools.readEnvSecret({ secretId: 'x' })).rejects.toThrow(
      'SecretString is not valid JSON.',
    );
  });

  it('rejects non-object JSON secrets', async () => {
    const tools = await AwsSecretsManagerTools.init({ xray: 'off' });
    spySend(tools).mockResolvedValueOnce({
      SecretString: JSON.stringify(['nope']),
    });

    await expect(tools.readEnvSecret({ secretId: 'x' })).rejects.toThrow(
      'Secret JSON must be an object map.',
    );
  });

  it('rejects non-string values', async () => {
    const tools = await AwsSecretsManagerTools.init({ xray: 'off' });
    spySend(tools).mockResolvedValueOnce({
      SecretString: JSON.stringify({ A: 123 }),
    });

    await expect(tools.readEnvSecret({ secretId: 'x' })).rejects.toThrow(
      "Secret JSON value for 'A' must be a string or null.",
    );
  });

  it('upsertEnvSecret only creates on ResourceNotFound', async () => {
    const tools = await AwsSecretsManagerTools.init({ xray: 'off' });
    spySend(tools)
      .mockRejectedValueOnce(
        Object.assign(new Error('nope'), { name: 'ResourceNotFoundException' }),
      )
      .mockResolvedValueOnce({});

    await expect(
      tools.upsertEnvSecret({ secretId: 'x', value: { A: '1' } }),
    ).resolves.toBe('created');
  });
});
