import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

import type { WorkspaceManager } from '../workspace';
import type { ContainerManager } from '../container/index';
import type { GitHubAuthManager } from '../github/auth-manager';
import { SERO_AGENT_DIR } from '../env';
import type { JjResult } from './types';

const execFileAsync = promisify(execFile);

function shQuote(input: string): string {
  return `'${input.replace(/'/g, `'"'"'`)}'`;
}

export class JjRunner {
  constructor(
    private readonly workspaceManager: WorkspaceManager,
    private readonly containerManager: ContainerManager,
    private readonly githubAuth?: GitHubAuthManager,
  ) {}

  private async ensureContainer(workspaceId: string, workspacePath: string): Promise<void> {
    await this.containerManager.ensure({
      workspaceId,
      hostPath: workspacePath,
      readOnlyMounts: [
        path.join(SERO_AGENT_DIR, 'skills'),
        path.join(SERO_AGENT_DIR, 'prompts'),
      ],
    });
  }

  async runCommand(
    workspaceId: string,
    program: string,
    args: string[],
    timeoutMs = 30_000,
  ): Promise<JjResult> {
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
      // No SSH workaround needed — all git traffic uses HTTPS with token auth.
      const command = `${shQuote(program)} ${args.map(shQuote).join(' ')}`;
      return this.containerManager.exec(workspaceId, command, '/workspace', timeoutMs);
    }

    // Host execution — inject GitHub auth env vars into the process environment
    const env = { ...process.env };
    if (this.githubAuth) {
      const authVars = this.githubAuth.getAuthEnvVars();
      Object.assign(env, authVars);
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
        stderr: String(err?.stderr ?? err?.message ?? 'jj command failed'),
      };
    }
  }

  async run(workspaceId: string, args: string[], timeoutMs = 30_000): Promise<JjResult> {
    return this.runCommand(workspaceId, 'jj', args, timeoutMs);
  }
}
