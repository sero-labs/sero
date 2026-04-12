import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';

import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { ContainerManager } from '@electron/features/container';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
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

/**
 * Check if the host likely has SSH keys that can authenticate with GitHub.
 * Cached after first check for the process lifetime.
 */
let _sshAvailable: boolean | null = null;
async function isHostSshAvailable(): Promise<boolean> {
  if (_sshAvailable !== null) return _sshAvailable;

  // Quick check: do SSH key files exist?
  const sshDir = path.join(homedir(), '.ssh');
  const hasKeys = ['id_ed25519', 'id_rsa', 'id_ecdsa'].some((k) =>
    existsSync(path.join(sshDir, k)),
  );
  if (!hasKeys) {
    _sshAvailable = false;
    return false;
  }

  // Verify SSH actually authenticates with GitHub
  try {
    const { stderr } = await execFileAsync('ssh', ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=5', 'git@github.com'], {
      timeout: 10_000,
    }).catch((error: unknown) => {
      // ssh -T exits with code 1 on success ("You've successfully authenticated")
      const normalized = normalizeExecFileFailure(error);
      return { stdout: normalized.stdout, stderr: normalized.stderr };
    });
    _sshAvailable = stderr.includes('successfully authenticated');
  } catch {
    _sshAvailable = false;
  }
  return _sshAvailable;
}

function shQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

export class GitRunner {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly containerManager: ContainerManager,
    private readonly githubAuth?: GitHubAuthManager,
  ) {}

  private async ensureContainer(workspaceId: string, workspacePath: string): Promise<void> {
    const config = await buildWorkspaceContainerConfig(
      this.workspaceManager,
      workspaceId,
      workspacePath,
    );
    await this.containerManager.ensure(config);
  }

  async runCommand(
    workspaceId: string,
    program: string,
    args: string[],
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

    const useContainer = await this.workspaceManager.isContainerEnabled(workspaceId);

    if (useContainer) {
      await this.ensureContainer(workspaceId, workspacePath);
      // GitHub auth env vars (GH_TOKEN, URL rewrites, HTTP auth header) are injected
      // by ContainerManager.exec() via its getExtraEnvVars callback.
      const command = `${shQuote(program)} ${args.map(shQuote).join(' ')}`;
      return this.containerManager.exec(workspaceId, command, '/workspace', timeoutMs, {
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
