import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { promisify } from 'util';

import type { WorkspaceManager } from '../workspace';
import type { ContainerManager } from '../container/index';
import type { GitHubAuthManager } from '../github/auth-manager';
import { buildContainerConfig } from '../ipc/shared-infra';
import type { GitResult } from './types';

const execFileAsync = promisify(execFile);

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
    }).catch((err: any) => {
      // ssh -T exits with code 1 on success ("You've successfully authenticated")
      return { stdout: String(err?.stdout ?? ''), stderr: String(err?.stderr ?? '') };
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
    const config = await buildContainerConfig(workspaceId, workspacePath);
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
      // GitHub auth env vars (GH_TOKEN, GIT_ASKPASS, URL rewrites) are injected
      // by ContainerManager.exec() via its getExtraEnvVars callback.
      const command = `${shQuote(program)} ${args.map(shQuote).join(' ')}`;
      return this.containerManager.exec(workspaceId, command, '/workspace', timeoutMs);
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
        // Keep GH_TOKEN (for gh CLI) but drop the SSH→HTTPS rewrite + ASKPASS
        // so git uses native SSH transport.
        if (authVars.GH_TOKEN) {
          env.GH_TOKEN = authVars.GH_TOKEN;
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
    } catch (err: any) {
      const code = typeof err?.code === 'number' ? err.code : 1;
      return {
        exitCode: code,
        stdout: String(err?.stdout ?? ''),
        stderr: String(err?.stderr ?? err?.message ?? 'git command failed'),
      };
    }
  }

  async run(workspaceId: string, args: string[], timeoutMs = 30_000): Promise<GitResult> {
    return this.runCommand(workspaceId, 'git', args, timeoutMs);
  }
}
