import type { ExecResult } from '@electron/features/container/core/types';
import { workspaceManager } from '@electron/features/workspace/manager';
import { runtimeManager } from './runtime-manager';
import { toRuntimeWorkspacePath } from './runtime-paths';
import type { RuntimeExecInput } from './types';
import {
  classifyNativeBuildFailure,
  createNativeBuildToolsRequiredMetadata,
} from './native-build/classifier';
import type { NativeBuildContainerFallbackOptions } from './native-build/types';

interface RunWorkspaceCommandOptions {
  isolated?: boolean;
  classifyNativeBuildFailure?: boolean;
  nativeBuildFallback?: NativeBuildContainerFallbackOptions;
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
    const execInput: RuntimeExecInput = { command, cwd: runtimeCwd, timeoutMs };
    if (options?.isolated !== undefined) execInput.isolated = options.isolated;
    const result = await runtime.exec(execInput);
    if (options?.classifyNativeBuildFailure) {
      const failure = classifyNativeBuildFailure({
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        platform: process.platform,
      });
      if (failure) {
        return {
          ...result,
          nativeBuildToolsRequired: createNativeBuildToolsRequiredMetadata(failure, options.nativeBuildFallback),
        };
      }
    }
    return result;
  } catch (err: unknown) {
    return {
      stdout: '',
      stderr: err instanceof Error ? err.message : String(err),
      exitCode: 1,
    };
  }
}

