import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { buildWorkspaceContainerConfig } from '@electron/features/container/core/workspace-container-config';
import { toWorkspaceContainerPath } from '../container-path';
import type {
  RuntimeCapabilities,
  RuntimeExecOptions,
  RuntimeHealth,
  RuntimeTerminalInput,
  RuntimeTerminalSession,
  WorkspaceRuntimeFacade,
} from '../types';
import type { ExecResult } from '@electron/features/container/core/types';

export const APPLE_CONTAINER_CAPABILITIES: RuntimeCapabilities = {
  exec: true,
  interactiveTerminal: true,
  directFileRead: false,
  directFileWrite: false,
  fileUpload: false,
  fileDownload: false,
  managedDevServers: true,
  browserAutomation: true,
  portDiscovery: true,
  portForward: false,
  logStream: false,
};

type ContainerRuntimeAdapter = Pick<
  WorkspaceRuntimeFacade,
  'providerId' | 'actualRuntime' | 'capabilities' | 'health' | 'exec' | 'createTerminal'
>;

interface ContainerRuntimeAdapterInput {
  workspaceId: string;
  workspacePath: string;
  containerManager: ContainerManager;
  workspaceManager: WorkspaceManager;
}

export function createContainerRuntimeAdapter(
  input: ContainerRuntimeAdapterInput,
): ContainerRuntimeAdapter {
  return {
    providerId: 'apple-container',
    actualRuntime: 'container',
    capabilities: APPLE_CONTAINER_CAPABILITIES,
    async health(): Promise<RuntimeHealth> {
      const state = await input.containerManager.inspect(input.workspaceId);
      if (state.state === 'running') {
        return { providerId: 'apple-container', status: 'ready' };
      }
      return {
        providerId: 'apple-container',
        status: 'unavailable',
        message: 'Container is not running.',
      };
    },
    async exec(command: string, options: RuntimeExecOptions): Promise<ExecResult> {
      try {
        const config = await buildWorkspaceContainerConfig(
          input.workspaceManager,
          input.workspaceId,
          input.workspacePath,
          { isolated: options.isolated },
        );
        await input.containerManager.ensure(config);

        const containerCwd = toWorkspaceContainerPath(input.workspacePath, options.cwd);
        if (!containerCwd) {
          return outsideWorkspaceResult(options.cwd);
        }

        return input.containerManager.exec(
          input.workspaceId,
          command,
          containerCwd,
          options.timeoutMs,
        );
      } catch (error: unknown) {
        return {
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
        };
      }
    },
    async createTerminal(options: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
      const pty = input.containerManager.terminals.createTerminal(
        input.workspaceId,
        options.terminalId,
        options.cols,
        options.rows,
      );
      return { pty, runtime: 'container' };
    },
  };
}

function outsideWorkspaceResult(cwd: string): ExecResult {
  return {
    stdout: '',
    stderr: `Cannot run command outside workspace root in container mode: ${cwd}`,
    exitCode: 1,
  };
}
