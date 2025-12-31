/**
 * Requirements addressed:
 * - `push` should create only when the secret doesn't exist (not on any error).
 */

type AwsishError = {
  name?: unknown;
  code?: unknown;
  Code?: unknown;
};

export const getAwsErrorCode = (err: unknown): string | undefined => {
  if (!err || typeof err !== 'object') return;
  const e = err as AwsishError;
  const code = e.name ?? e.code ?? e.Code;
  return typeof code === 'string' ? code : undefined;
};

export const isAwsErrorCode = (err: unknown, code: string): boolean =>
  getAwsErrorCode(err) === code;

export const isResourceNotFoundError = (err: unknown): boolean =>
  isAwsErrorCode(err, 'ResourceNotFoundException');
