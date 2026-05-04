import type { ExecResult } from '@electron/features/container/core/types';
import { workspaceManager } from '@electron/features/workspace/manager';
import { createWorkspaceRuntimeFacade } from './runtime-facade';

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

  const runtime = await createWorkspaceRuntimeFacade(workspaceId);
  if (
    runtime.resolution.desiredRuntime === 'container'
    && runtime.actualRuntime === 'host'
    && runtime.fallbackReason
  ) {
    console.warn(`[workspace-command-runner] ${runtime.fallbackReason}`);
  }

  return runtime.exec(command, {
    cwd,
    timeoutMs,
    isolated: options?.isolated,
  });
}
