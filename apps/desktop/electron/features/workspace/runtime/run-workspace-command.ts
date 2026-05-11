import type { ExecResult } from '@electron/features/container/core/types';
import { workspaceManager } from '@electron/features/workspace/manager';
import { runtimeManager } from './runtime-manager';
import { toRuntimeWorkspacePath } from './runtime-paths';

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

  void options;

  const runtimeCwd = toRuntimeWorkspacePath(workspacePath, cwd);
  if (!runtimeCwd) {
    return {
      stdout: '',
      stderr: `Cannot run command outside workspace root: ${cwd}`,
      exitCode: 1,
    };
  }

  try {
    const runtime = await runtimeManager.getRuntime(workspaceId);
    return await runtime.exec({ command, cwd: runtimeCwd, timeoutMs });
  } catch (err: unknown) {
    return {
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
    };
  }
}

