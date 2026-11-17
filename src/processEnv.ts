/**
 * Environment-map value type kept local so the package root has no public
 * type dependency on the optional get-dotenv peer.
 *
 * @packageDocumentation
 */

/** A string environment map; undefined values serialize as omitted keys. */
export type ProcessEnv = Record<string, string | undefined>;
