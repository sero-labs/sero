import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

import type { WorkspaceManager } from '../workspace';
import type { ContainerManager } from '../container/index';
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

  async run(workspaceId: string, args: string[], timeoutMs = 30_000): Promise<JjResult> {
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
      // Non-interactive container pushes/fetches over SSH can't answer host-key prompts.
      // Accept new host keys automatically so first push to github.com succeeds.
      const sshEnvPrefix =
        "export GIT_SSH_COMMAND=${GIT_SSH_COMMAND:-'ssh -o StrictHostKeyChecking=accept-new'};";
      const command = `${sshEnvPrefix} jj ${args.map(shQuote).join(' ')}`;
      return this.containerManager.exec(workspaceId, command, '/workspace', timeoutMs);
    }

    try {
      const { stdout, stderr } = await execFileAsync('jj', args, {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
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
}
