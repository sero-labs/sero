import path from 'path';

import { loadBundledToolchainManifest } from './manifest';
import { ToolchainManager } from './manager';
import { prependPathEntries } from './path-env';
import type { ToolInstallReason, ToolName, ToolResolution, ToolStatus } from './types';
import { verifyTool } from './verifiers';

const TOOL_NAMES = new Set<ToolName>([
  'node',
  'npm',
  'pnpm',
  'git',
  'ssh',
  'bash',
  'rg',
  'fd',
  'jq',
  'gh',
  'curl',
  'zip',
  'unzip',
]);

export interface HostToolResolverOptions {
  manager?: Pick<ToolchainManager, 'resolve' | 'ensure' | 'status' | 'binDirs'>;
  platform?: NodeJS.Platform;
}

export interface HostToolResolverLike {
  resolve(tool: ToolName): Promise<ToolResolution | null>;
  ensure(tool: ToolName, reason: ToolInstallReason): Promise<ToolResolution>;
  status(tool: ToolName): Promise<ToolStatus>;
  prepareEnv(env?: Record<string, string>): Promise<Record<string, string>>;
  prepareShell(reason: ToolInstallReason): Promise<ToolResolution>;
  prepareProgram(program: string, reason: ToolInstallReason): Promise<string>;
  resolveTerminalShell(candidate: string | undefined, reason: ToolInstallReason): Promise<string>;
}

export class HostToolResolver implements HostToolResolverLike {
  private readonly manager: Pick<ToolchainManager, 'resolve' | 'ensure' | 'status' | 'binDirs'>;
  private readonly platform: NodeJS.Platform;

  constructor(options: HostToolResolverOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.manager = options.manager ?? new ToolchainManager({
      manifest: loadBundledToolchainManifest(),
      platform: this.platform,
    });
  }

  resolve(tool: ToolName): Promise<ToolResolution | null> {
    return this.manager.resolve(tool);
  }

  ensure(tool: ToolName, reason: ToolInstallReason): Promise<ToolResolution> {
    return this.manager.ensure(tool, reason);
  }

  status(tool: ToolName): Promise<ToolStatus> {
    return this.manager.status(tool);
  }

  async prepareEnv(env: Record<string, string> = {}): Promise<Record<string, string>> {
    const binDirs = await this.manager.binDirs();
    if (binDirs.length === 0) return { ...env };
    return normalizeEnv(prependPathEntries(env, binDirs, this.platform));
  }

  async prepareShell(reason: ToolInstallReason): Promise<ToolResolution> {
    return this.ensure('bash', reason);
  }

  async prepareProgram(program: string, reason: ToolInstallReason): Promise<string> {
    if (!isToolName(program)) return program;
    const resolution = await this.ensure(program, reason);
    return resolution.path;
  }

  async resolveTerminalShell(candidate: string | undefined, reason: ToolInstallReason): Promise<string> {
    if (candidate && await this.isVerifiedShell(candidate) && this.isTerminalExecutablePath(candidate)) return candidate;
    const resolution = await this.prepareShell(reason);
    if (!this.isTerminalExecutablePath(resolution.path)) {
      throw new Error('Git Bash executable not found. Install Git for Windows or configure a terminal shell path.');
    }
    return resolution.path;
  }

  private isTerminalExecutablePath(candidate: string): boolean {
    return this.platform !== 'win32' || path.win32.isAbsolute(candidate);
  }

  private async isVerifiedShell(candidate: string): Promise<boolean> {
    const status = await verifyTool('bash', candidate, { source: 'system' });
    return status.state === 'ready';
  }
}

export function createHostToolResolver(options: HostToolResolverOptions = {}): HostToolResolver {
  return new HostToolResolver(options);
}

export function isToolName(program: string): program is ToolName {
  return TOOL_NAMES.has(program as ToolName);
}

function normalizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
