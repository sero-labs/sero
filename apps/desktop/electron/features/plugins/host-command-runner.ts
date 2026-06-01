import { execFile } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

import { createHostToolResolver, type HostToolResolverLike } from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import { renderWindowsCommandScript } from '@electron/features/workspace/runtime/toolchains/windows-command';
import type { ToolInstallReason } from '@electron/features/workspace/runtime/toolchains/types';

export interface PluginHostCommandResult {
  stdout: string;
  stderr: string;
}

export interface PluginHostCommandExecuteOptions {
  cwd: string;
  env: Record<string, string>;
  encoding: 'utf8';
}

export type PluginHostCommandExecutor = (
  program: string,
  args: string[],
  options: PluginHostCommandExecuteOptions,
) => Promise<PluginHostCommandResult>;

export interface PluginHostCommandOptions {
  env?: NodeJS.ProcessEnv;
  execute?: PluginHostCommandExecutor;
  platform?: NodeJS.Platform;
  tools?: Pick<HostToolResolverLike, 'prepareEnv' | 'prepareProgram'>;
}

export interface PluginHostShellCommandOptions {
  env?: NodeJS.ProcessEnv;
  loginShell?: boolean;
  platform?: NodeJS.Platform;
  tools?: Pick<HostToolResolverLike, 'prepareEnv' | 'prepareProgram' | 'prepareShell'>;
}

export interface RenderedPluginHostCommand {
  program: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export async function runPluginHostCommand(
  command: string,
  args: string[],
  cwd: string,
  options: PluginHostCommandOptions = {},
): Promise<PluginHostCommandResult> {
  const rendered = await renderPluginHostCommand(command, args, cwd, options);
  const execute = options.execute ?? defaultExecute;

  return execute(rendered.program, rendered.args, {
    cwd: rendered.cwd,
    env: rendered.env,
    encoding: 'utf8',
  });
}

export async function renderPluginHostCommand(
  command: string,
  args: string[],
  cwd: string,
  options: PluginHostCommandOptions = {},
): Promise<RenderedPluginHostCommand> {
  const platform = options.platform ?? process.platform;
  const tools = options.tools ?? createHostToolResolver({ platform });
  const reason = makeReason([command, ...args].join(' '));
  if (requiresNodeRuntime(command)) {
    await tools.prepareProgram('node', reason);
  }
  const preparedProgram = resolveSystemFallbackProgram(
    await tools.prepareProgram(command, reason),
    command,
    platform,
  );
  const preparedEnv = await tools.prepareEnv(normalizeEnv(options.env ?? process.env));
  const rendered = platform === 'win32'
    ? renderWindowsCommandScript(preparedProgram, args)
    : null;

  return {
    program: rendered?.program ?? preparedProgram,
    args: rendered?.args ?? args,
    cwd,
    env: preparedEnv,
  };
}

export async function renderPluginHostShellCommand(
  command: string,
  cwd: string,
  options: PluginHostShellCommandOptions = {},
): Promise<RenderedPluginHostCommand> {
  const platform = options.platform ?? process.platform;
  const tools = options.tools ?? createHostToolResolver({ platform });
  const reason = makeReason(command);
  await prepareShellCommandTools(command, tools, reason);
  const shell = await tools.prepareShell(reason);

  return {
    program: shell.path,
    args: options.loginShell === true ? ['--login', '-c', command] : ['-c', command],
    cwd,
    env: await tools.prepareEnv(normalizeEnv(options.env ?? process.env)),
  };
}

function defaultExecute(
  program: string,
  args: string[],
  options: PluginHostCommandExecuteOptions,
): Promise<PluginHostCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(program, args, options, (error, stdout, stderr) => {
      const result = {
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
      };
      if (error) {
        reject(Object.assign(error, result));
        return;
      }
      resolve(result);
    });
  });
}

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function requiresNodeRuntime(command: string): boolean {
  return command === 'npm' || command === 'pnpm';
}

async function prepareShellCommandTools(
  command: string,
  tools: Pick<HostToolResolverLike, 'prepareProgram'>,
  reason: ToolInstallReason,
): Promise<void> {
  if (usesShellCommand(command, 'node') || usesShellCommand(command, 'npm') || usesShellCommand(command, 'pnpm')) {
    await tools.prepareProgram('node', reason);
  }
  if (usesShellCommand(command, 'npm')) await tools.prepareProgram('npm', reason);
  if (usesShellCommand(command, 'pnpm')) await tools.prepareProgram('pnpm', reason);
}

function usesShellCommand(command: string, executable: string): boolean {
  return new RegExp(`(^|[\\s;&|()])${executable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s;&|()]|$)`).test(command);
}

function makeReason(command: string): ToolInstallReason {
  return {
    kind: 'plugin-install',
    command,
    detail: 'Sero plugin install',
  };
}

function resolveSystemFallbackProgram(
  preparedProgram: string,
  requestedCommand: string,
  platform: NodeJS.Platform,
): string {
  if (preparedProgram !== requestedCommand || isAbsoluteProgram(preparedProgram, platform)) {
    return preparedProgram;
  }
  return systemFallbackCandidates(requestedCommand, platform).find((candidate) => existsSync(candidate)) ?? preparedProgram;
}

function systemFallbackCandidates(command: string, platform: NodeJS.Platform): string[] {
  if (command !== 'tar') return [];
  if (platform === 'win32') {
    return [path.win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')];
  }
  return ['/usr/bin/tar', '/bin/tar'];
}

function isAbsoluteProgram(program: string, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? path.win32.isAbsolute(program) : path.isAbsolute(program);
}
