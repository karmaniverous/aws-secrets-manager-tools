/**
 * Requirements addressed:
 * - Optional AWS X-Ray capture support.
 * - Default behavior “auto”: only attempt capture when AWS_XRAY_DAEMON_ADDRESS
 *   is set.
 * - Avoid importing/enabling X-Ray when the daemon address is not set (the
 *   X-Ray SDK will throw otherwise).
 */

export type XrayMode = 'auto' | 'on' | 'off';

/**
 * Minimal console-like logger contract used by this package.
 *
 * If you pass a custom logger via AWS client config, it must implement these
 * methods (no internal polyfills are applied).
 */
export type Logger = Pick<Console, 'debug' | 'error' | 'info' | 'warn'>;

export const shouldEnableXray = (
  mode: XrayMode | undefined,
  daemonAddress: string | undefined,
): boolean => {
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return Boolean(daemonAddress);
};

export const captureAwsSdkV3Client = async <TClient extends object>(
  client: TClient,
  {
    mode = 'auto',
    logger = console,
    daemonAddress = process.env.AWS_XRAY_DAEMON_ADDRESS,
  }: {
    mode?: XrayMode;
    logger?: Logger;
    daemonAddress?: string;
  } = {},
): Promise<TClient> => {
  if (!shouldEnableXray(mode, daemonAddress)) return client;

  if (!daemonAddress) {
    throw new Error(
      'X-Ray capture requested but AWS_XRAY_DAEMON_ADDRESS is not set.',
    );
  }

  // Guarded dynamic import: some X-Ray SDK integrations throw when daemon
  // configuration is missing, so do not import unless we are capturing.
  let mod: { default?: unknown };
  try {
    mod = (await import('aws-xray-sdk')) as unknown as { default?: unknown };
  } catch {
    throw new Error(
      "X-Ray capture is enabled but 'aws-xray-sdk' is not installed. Install it or set xray to 'off'.",
    );
  }
  const AWSXRay = (mod.default ?? mod) as unknown as {
    captureAWSv3Client?: <U extends object>(c: U) => U;
  };

  if (typeof AWSXRay.captureAWSv3Client !== 'function') {
    logger.debug('aws-xray-sdk does not expose captureAWSv3Client', AWSXRay);
    throw new Error('aws-xray-sdk missing captureAWSv3Client export.');
  }

  logger.debug('Enabling AWS X-Ray capture for AWS SDK v3 client.');
  return AWSXRay.captureAWSv3Client(client);
};
