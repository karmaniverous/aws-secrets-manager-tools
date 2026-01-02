/**
 * Requirements addressed:
 * - Keep command registration modules typed without importing get-dotenv
 *   internal CLI generic types.
 * - Avoid `any` (ESLint no-explicit-any); use `unknown` and runtime narrowing.
 */

import type { AwsCtx } from '../secretsPluginCtx';

export type SecretsPluginOption = {
  conflicts: (names: string | string[]) => SecretsPluginOption;
  default: (value: unknown) => SecretsPluginOption;
  argParser: (
    fn: (value: string, previous: unknown) => unknown,
  ) => SecretsPluginOption;
};

export type SecretsPluginCommand = {
  description: (desc: string) => SecretsPluginCommand;
  command: (name: string) => SecretsPluginCommand;
  addOption: (option: SecretsPluginOption) => SecretsPluginCommand;
  createOption: (flags: string, description: string) => SecretsPluginOption;
  action: (fn: (...args: unknown[]) => unknown) => SecretsPluginCommand;
};

export type SecretsPluginCli = SecretsPluginCommand & {
  getCtx: () => AwsCtx;
};

export type SecretsPluginApi = {
  createPluginDynamicOption: (
    cmd: unknown,
    flags: string,
    describe: (helpCfg: unknown, pluginCfg: unknown) => string,
  ) => SecretsPluginOption;
  readConfig: (cli: unknown) => unknown;
};
