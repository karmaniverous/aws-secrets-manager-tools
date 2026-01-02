/**
 * Requirements addressed:
 * - Keep command registration modules typed without importing get-dotenv
 *   internal CLI generic types.
 */

import type { AwsCtx } from '../secretsPluginCtx';

export type SecretsPluginOption = {
  conflicts: (names: string | string[]) => SecretsPluginOption;
  default: (value: any) => SecretsPluginOption;
  argParser: (fn: (value: string, previous: any) => any) => SecretsPluginOption;
};

export type SecretsPluginCommand = {
  description: (desc: string) => SecretsPluginCommand;
  command: (name: string) => SecretsPluginCommand;
  addOption: (option: SecretsPluginOption) => SecretsPluginCommand;
  createOption: (flags: string, description: string) => SecretsPluginOption;
  action: (fn: (...args: any[]) => any) => SecretsPluginCommand;
};

export type SecretsPluginCli = SecretsPluginCommand & {
  getCtx: () => AwsCtx;
};

export type SecretsPluginApi = {
  createPluginDynamicOption: (
    cmd: any,
    flags: string,
    describe: (helpCfg: any, pluginCfg: any) => string,
  ) => SecretsPluginOption;
  readConfig: (cli: any) => any;
};
