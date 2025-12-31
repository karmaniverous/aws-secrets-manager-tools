/**
 * Requirements addressed:
 * - Replace sample CLI with a get-dotenv CLI alias `aws-secrets-manager-tools`.
 * - Duplicate default get-dotenv CLI composition, but omit awsWhoamiPlugin.
 * - Mount secrets plugin under aws: `awsPlugin().use(secretsPlugin())`.
 */

import { createCli } from '@karmaniverous/get-dotenv/cli';
import {
  awsPlugin,
  batchPlugin,
  cmdPlugin,
  initPlugin,
} from '@karmaniverous/get-dotenv/plugins';

import { secretsPlugin } from '../../secretsPlugin/secretsPlugin';

await createCli({
  alias: 'aws-secrets-manager-tools',
  compose: (program) =>
    program
      .use(
        cmdPlugin({ asDefault: true, optionAlias: '-c, --cmd <command...>' }),
      )
      .use(batchPlugin())
      .use(awsPlugin().use(secretsPlugin()))
      .use(initPlugin()),
})();
