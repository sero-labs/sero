import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import { workspaceManager } from '@electron/features/workspace/manager';
import {
  resolveWorkspaceRuntime,
  type WorkspaceRuntimeResolution,
} from '@electron/features/workspace/runtime-resolution';
import { createContainerRuntimeAdapter } from './adapters/container-runtime-adapter';
import { createHostRuntimeAdapter } from './adapters/host-runtime-adapter';
import { createOpenShellLocalRuntimeAdapter } from './adapters/openshell-local-runtime-adapter';
import type { WorkspaceRuntimeFacade } from './types';

type RuntimeAdapter = Pick<
  WorkspaceRuntimeFacade,
  'providerId' | 'actualRuntime' | 'capabilities' | 'health' | 'exec' | 'createTerminal'
>;

interface CreateHostAdapterInput {
  workspaceId: string;
  workspacePath: string;
  terminals: ContainerManager['terminals'];
}

interface CreateContainerAdapterInput {
  workspaceId: string;
  workspacePath: string;
  containerManager: ContainerManager;
  workspaceManager: WorkspaceManager;
}

interface CreateOpenShellLocalAdapterInput {
  workspaceId: string;
  workspacePath: string;
  terminals: ContainerManager['terminals'];
  workspaceManager: WorkspaceManager;
}

interface RuntimeFacadeDependencies {
  resolveWorkspaceRuntime(workspaceId: string): Promise<WorkspaceRuntimeResolution>;
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
  createHostRuntimeAdapter(input: CreateHostAdapterInput): RuntimeAdapter;
  createContainerRuntimeAdapter(input: CreateContainerAdapterInput): RuntimeAdapter;
  createOpenShellLocalRuntimeAdapter(input: CreateOpenShellLocalAdapterInput): RuntimeAdapter;
}

export interface CreateWorkspaceRuntimeFacadeOptions {
  deps?: Partial<RuntimeFacadeDependencies>;
}

export async function createWorkspaceRuntimeFacade(
  workspaceId: string,
  options: CreateWorkspaceRuntimeFacadeOptions = {},
): Promise<WorkspaceRuntimeFacade> {
  const deps = resolveRuntimeFacadeDeps(options.deps);
  const resolution = await deps.resolveWorkspaceRuntime(workspaceId);
  const adapter = resolution.providerId === 'openshell-local'
    ? deps.createOpenShellLocalRuntimeAdapter({
        workspaceId,
        workspacePath: resolution.workspacePath,
        workspaceManager: deps.workspaceManager,
        terminals: deps.containerManager.terminals,
      })
    : resolution.actualRuntime === 'container'
      ? deps.createContainerRuntimeAdapter({
          workspaceId,
          workspacePath: resolution.workspacePath,
          workspaceManager: deps.workspaceManager,
          containerManager: deps.containerManager,
        })
      : deps.createHostRuntimeAdapter({
          workspaceId,
          workspacePath: resolution.workspacePath,
          terminals: deps.containerManager.terminals,
        });

  return {
    ...adapter,
    workspaceId,
    workspacePath: resolution.workspacePath,
    actualRuntime: resolution.actualRuntime,
    resolution,
    fallbackReason: resolution.fallbackReason,
  };
}

function resolveRuntimeFacadeDeps(
  deps: Partial<RuntimeFacadeDependencies> = {},
): RuntimeFacadeDependencies {
  return {
    resolveWorkspaceRuntime: deps.resolveWorkspaceRuntime ?? resolveWorkspaceRuntime,
    workspaceManager: deps.workspaceManager ?? workspaceManager,
    containerManager: deps.containerManager ?? containerManager,
    createHostRuntimeAdapter: deps.createHostRuntimeAdapter ?? createHostRuntimeAdapter,
    createContainerRuntimeAdapter: deps.createContainerRuntimeAdapter ?? createContainerRuntimeAdapter,
    createOpenShellLocalRuntimeAdapter: deps.createOpenShellLocalRuntimeAdapter ?? createOpenShellLocalRuntimeAdapter,
  };
}
