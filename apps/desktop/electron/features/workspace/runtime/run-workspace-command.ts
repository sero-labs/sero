import { execFile } from 'child_process';
import { promisify } from 'util';

import type { ExecResult } from '@electron/features/container/core/types';
import { containerManager } from '@electron/features/container/core/singleton';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import { workspaceManager } from '@electron/features/workspace/manager';
import { resolveWorkspaceRuntime } from '@electron/features/workspace/runtime-resolution';
import { toWorkspaceContainerPath } from './container-path';

const execFileAsync = promisify(execFile);

interface RunWorkspaceCommandOptions {
  isolated?: boolean;
}

export async function runWorkspaceCommand(
  workspaceId: string,
  cwd: string,
  command: string,
  timeoutMs = 120_000,
  options?: RunWorkspaceCommandOptions,
): Promise<ExecResult> {
  const workspacePath = workspaceManager.getPath(workspaceId);
  if (!workspacePath) {
    return {
      stdout: '',
      stderr: `Workspace not found: ${workspaceId}`,
      exitCode: 1,
    };
  }

  const runtime = await resolveWorkspaceRuntime(workspaceId);
  if (runtime.actualRuntime === 'container') {
    try {
      const containerConfig = await buildWorkspaceContainerConfig(
        workspaceManager,
        workspaceId,
        workspacePath,
        { isolated: options?.isolated },
      );
      await containerManager.ensure(containerConfig);
      const containerCwd = toWorkspaceContainerPath(workspacePath, cwd);
      if (!containerCwd) {
        return {
          stdout: '',
          stderr: `Cannot run command outside workspace root in container mode: ${cwd}`,
          exitCode: 1,
        };
      }
      return containerManager.exec(workspaceId, command, containerCwd, timeoutMs);
    } catch (err: unknown) {
      return {
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
      };
    }
  }

  if (runtime.desiredRuntime === 'container' && runtime.fallbackReason) {
    console.warn(`[workspace-command-runner] ${runtime.fallbackReason}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const execErr = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      stdout: String(execErr.stdout ?? ''),
      stderr: String(execErr.stderr ?? execErr.message ?? 'command failed'),
      exitCode: typeof execErr.code === 'number' ? execErr.code : 1,
    };
  }
}

