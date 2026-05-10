import { execFile } from 'child_process';
import { existsSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';

import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { RuntimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import type { GitHubAuthManager } from '@electron/features/auth/github/auth-manager';
import type { GitResult } from '../support/types';

const execFileAsync = promisify(execFile);

interface ExecFileFailure {
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
  message?: unknown;
}

function normalizeExecFileFailure(error: unknown): { code: number; stdout: string; stderr: string } {
  const failure = typeof error === 'object' && error !== null
    ? (error as ExecFileFailure)
    : null;

  return {
    code: typeof failure?.code === 'number' ? failure.code : 1,
    stdout: typeof failure?.stdout === 'string' ? failure.stdout : '',
    stderr: typeof failure?.stderr === 'string'
      ? failure.stderr
      : typeof failure?.message === 'string'
        ? failure.message
        : 'git command failed',
  };
}

const SSH_KEY_FILES = ['id_ed25519', 'id_rsa', 'id_ecdsa'] as const;
const SSH_AVAILABILITY_TTL_MS = 60_000;

interface SshAvailabilityCache {
  available: boolean;
  keySignature: string;
  expiresAtMs: number;
}

/**
 * Check if the host likely has SSH keys that can authenticate with GitHub.
 * The probe result is cached briefly and invalidated when known key metadata changes.
 */
let sshAvailabilityCache: SshAvailabilityCache | null = null;

function getSshKeySignature(): string {
  const sshDir = path.join(homedir(), '.ssh');
  const signatures: string[] = [];

  for (const keyFile of SSH_KEY_FILES) {
    const keyPath = path.join(sshDir, keyFile);
    if (!existsSync(keyPath)) continue;

    try {
      const stat = statSync(keyPath);
      signatures.push(`${keyFile}:${stat.size}:${stat.mtimeMs}`);
    } catch {
      signatures.push(`${keyFile}:present`);
    }
  }

  return signatures.join('|');
}

function readCachedSshAvailability(
  keySignature: string,
  nowMs: number,
): boolean | null {
  if (!sshAvailabilityCache) return null;
  if (sshAvailabilityCache.keySignature !== keySignature) return null;
  if (sshAvailabilityCache.expiresAtMs <= nowMs) return null;
  return sshAvailabilityCache.available;
}

function writeSshAvailabilityCache(
  keySignature: string,
  available: boolean,
  nowMs: number,
): void {
  sshAvailabilityCache = {
    available,
    keySignature,
    expiresAtMs: nowMs + SSH_AVAILABILITY_TTL_MS,
  };
}

async function isHostSshAvailable(): Promise<boolean> {
  const nowMs = Date.now();
  const keySignature = getSshKeySignature();
  if (!keySignature) {
    writeSshAvailabilityCache('', false, nowMs);
    return false;
  }

  const cachedAvailability = readCachedSshAvailability(keySignature, nowMs);
  if (cachedAvailability !== null) {
    return cachedAvailability;
  }

  // Verify SSH actually authenticates with GitHub.
  try {
    const { stderr } = await execFileAsync('ssh', ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=5', 'git@github.com'], {
      timeout: 10_000,
    }).catch((error: unknown) => {
      // ssh -T exits with code 1 on success ("You've successfully authenticated")
      const normalized = normalizeExecFileFailure(error);
      return { stdout: normalized.stdout, stderr: normalized.stderr };
    });
    const available = stderr.includes('successfully authenticated');
    writeSshAvailabilityCache(keySignature, available, nowMs);
    return available;
  } catch (error) {
    console.warn('[git-runner] SSH probe failed; falling back to HTTPS-auth transport:', error);
    writeSshAvailabilityCache(keySignature, false, nowMs);
    return false;
  }
}

function shQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

export class GitRunner {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly runtimeManager: RuntimeManager,
    private readonly githubAuth?: GitHubAuthManager,
  ) {}

  async runCommand(
    workspaceId: string,
    program: string,
    args: string[],
    timeoutMs = 30_000,
  ): Promise<GitResult> {
    return this.runCommandWithEnv(workspaceId, program, args, {}, timeoutMs);
  }

  async runCommandWithEnv(
    workspaceId: string,
    program: string,
    args: string[],
    extraEnv: NodeJS.ProcessEnv,
    timeoutMs = 30_000,
  ): Promise<GitResult> {
    const workspacePath = this.workspaceManager.getPath(workspaceId);
    if (!workspacePath) {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `Workspace not found: ${workspaceId}`,
      };
    }

    const runtime = await this.runtimeManager.getRuntime(workspaceId);

    if (runtime.backend !== 'host') {
      const command = Object.keys(extraEnv).length > 0
        ? `env ${Object.entries(extraEnv)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .map(([key, value]) => `${key}=${shQuote(value)}`)
            .join(' ')} ${shQuote(program)} ${args.map(shQuote).join(' ')}`
        : `${shQuote(program)} ${args.map(shQuote).join(' ')}`;
      return runtime.exec({
        command,
        cwd: runtime.runtimeWorkspacePath,
        timeoutMs,
        injectGitAuth: program === 'git' || program === 'gh',
      });
    }

    // Host execution — inject GitHub auth env vars into the process environment.
    // If the host has working SSH keys, skip the HTTPS URL rewrite so git uses
    // SSH natively. SSH is more reliable for large pushes and avoids HTTP 400
    // errors caused by payload size limits during HTTPS ref negotiation.
    const env = { ...process.env };
    if (this.githubAuth) {
      const authVars = this.githubAuth.getAuthEnvVars();
      const sshWorks = await isHostSshAvailable();
      if (sshWorks) {
        // Keep GH_TOKEN for gh CLI and retain the GitHub HTTPS auth header so
        // existing HTTPS remotes still authenticate, but drop the SSH→HTTPS
        // rewrite so SSH remotes continue using native SSH transport.
        if (authVars.GH_TOKEN) {
          env.GH_TOKEN = authVars.GH_TOKEN;
        }
        if (authVars.GIT_TERMINAL_PROMPT) {
          env.GIT_TERMINAL_PROMPT = authVars.GIT_TERMINAL_PROMPT;
        }
        if (authVars.GIT_CONFIG_VALUE_2) {
          env.GIT_CONFIG_COUNT = '1';
          env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
          env.GIT_CONFIG_VALUE_0 = authVars.GIT_CONFIG_VALUE_2;
        }
      } else {
        Object.assign(env, authVars);
      }
    }
    Object.assign(env, extraEnv);

    try {
      const { stdout, stderr } = await execFileAsync(program, args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env,
      });
      return { exitCode: 0, stdout, stderr };
    } catch (error: unknown) {
      const normalized = normalizeExecFileFailure(error);
      return {
        exitCode: normalized.code,
        stdout: normalized.stdout,
        stderr: normalized.stderr,
      };
    }
  }

  async run(workspaceId: string, args: string[], timeoutMs = 30_000): Promise<GitResult> {
    return this.runCommand(workspaceId, 'git', args, timeoutMs);
  }

  async runWithEnv(
    workspaceId: string,
    args: string[],
    extraEnv: NodeJS.ProcessEnv,
    timeoutMs = 30_000,
  ): Promise<GitResult> {
    return this.runCommandWithEnv(workspaceId, 'git', args, extraEnv, timeoutMs);
  }

  async ensureRepoInitialized(workspaceId: string): Promise<void> {
    const root = await this.run(workspaceId, ['rev-parse', '--git-dir']);
    if (root.exitCode === 0) return;

    const init = await this.run(workspaceId, ['init', '-b', 'main']);
    if (init.exitCode === 0) return;

    const supportsInitialBranch = !/(unknown switch|unknown option|usage: git init)/i.test(
      init.stderr || init.stdout,
    );
    if (supportsInitialBranch) {
      throw new Error(init.stderr || 'Failed to initialize Git repository');
    }

    const fallback = await this.run(workspaceId, ['init']);
    if (fallback.exitCode !== 0) {
      throw new Error(fallback.stderr || fallback.stdout || 'Failed to initialize Git repository');
    }

    await this.run(workspaceId, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  }
}
