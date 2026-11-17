/**
 * Builds the get-dotenv host options for the standalone Secrets Manager CLI.
 *
 * @packageDocumentation
 */

import type { CreateCliOptions } from '@karmaniverous/get-dotenv/cli';
import {
  awsPlugin,
  batchPlugin,
  cmdPlugin,
  initPlugin,
} from '@karmaniverous/get-dotenv/plugins';

import { secretsPlugin } from '../../secretsPlugin/secretsPlugin';

/** Create CLI options with this package's host identity. */
export const createAwsSecretsCliOptions = (
  importMetaUrl: string,
): CreateCliOptions => ({
  alias: 'aws-secrets-manager-tools',
  importMetaUrl,
  compose: (program) =>
    program
      .use(
        cmdPlugin({ asDefault: true, optionAlias: '-c, --cmd <command...>' }),
      )
      .use(batchPlugin())
      .use(awsPlugin().use(secretsPlugin()))
      .use(initPlugin()),
});
