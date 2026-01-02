/**
 * Requirements addressed:
 * - Define the minimal host ctx surface relied on by `aws secrets` commands,
 *   without taking a dependency on get-dotenv internal ctx types.
 */

import type { DotenvProvenance } from './provenanceSelectors';

export type AwsCtx = {
  plugins?: {
    aws?: {
      region?: string;
    };
  };
  dotenv: Record<string, string | undefined>;
  dotenvProvenance?: DotenvProvenance;
};
