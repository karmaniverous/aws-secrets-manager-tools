/**
 * get-dotenv-backed CLI runner, loaded dynamically by the dependency-free bin
 * launcher so a missing optional peer can be reported cleanly.
 *
 * @packageDocumentation
 */

import { createCli } from '@karmaniverous/get-dotenv/cli';

import { createAwsSecretsCliOptions } from './cliOptions';

/** Run the standalone AWS Secrets Manager CLI. */
export const run = async (): Promise<void> => {
  await createCli(createAwsSecretsCliOptions(import.meta.url))();
};
