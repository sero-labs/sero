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
import { createOpenShellRemoteRuntimeAdapter } from './adapters/openshell-remote-runtime-adapter';
import { createOpenShellCloudRuntimeAdapter } from './adapters/openshell-cloud-runtime-adapter';
import { OpenShellCloudGatewayRegistry } from './openshell/cloud-gateway-registry';
import { OpenShellRemoteGatewayRegistry } from './openshell/remote-gateway-registry';
import type { WorkspaceRuntimeFacade } from './types';

type RuntimeAdapter = Pick<
  WorkspaceRuntimeFacade,
  | 'providerId'
  | 'actualRuntime'
  | 'capabilities'
  | 'health'
  | 'exec'
  | 'createTerminal'
  | 'streamLogs'
  | 'forwardPort'
  | 'destroy'
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

interface CreateOpenShellRemoteAdapterInput extends CreateOpenShellLocalAdapterInput {
  gatewayRegistry: OpenShellRemoteGatewayRegistry;
}

interface CreateOpenShellCloudAdapterInput extends CreateOpenShellLocalAdapterInput {
  gatewayRegistry: OpenShellCloudGatewayRegistry;
}

interface RuntimeFacadeDependencies {
  resolveWorkspaceRuntime(workspaceId: string): Promise<WorkspaceRuntimeResolution>;
  workspaceManager: WorkspaceManager;
  containerManager: ContainerManager;
  createHostRuntimeAdapter(input: CreateHostAdapterInput): RuntimeAdapter;
  createContainerRuntimeAdapter(input: CreateContainerAdapterInput): RuntimeAdapter;
  createOpenShellLocalRuntimeAdapter(input: CreateOpenShellLocalAdapterInput): RuntimeAdapter;
  createOpenShellRemoteRuntimeAdapter(input: CreateOpenShellRemoteAdapterInput): RuntimeAdapter;
  createOpenShellCloudRuntimeAdapter(input: CreateOpenShellCloudAdapterInput): RuntimeAdapter;
  openShellRemoteGatewayRegistry: OpenShellRemoteGatewayRegistry;
  openShellCloudGatewayRegistry: OpenShellCloudGatewayRegistry;
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
    : resolution.providerId === 'openshell-remote'
      ? deps.createOpenShellRemoteRuntimeAdapter({
          workspaceId,
          workspacePath: resolution.workspacePath,
          workspaceManager: deps.workspaceManager,
          terminals: deps.containerManager.terminals,
          gatewayRegistry: deps.openShellRemoteGatewayRegistry,
        })
      : resolution.providerId === 'openshell-cloud'
        ? deps.createOpenShellCloudRuntimeAdapter({
            workspaceId,
            workspacePath: resolution.workspacePath,
            workspaceManager: deps.workspaceManager,
            terminals: deps.containerManager.terminals,
            gatewayRegistry: deps.openShellCloudGatewayRegistry,
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
    createOpenShellRemoteRuntimeAdapter: deps.createOpenShellRemoteRuntimeAdapter ?? createOpenShellRemoteRuntimeAdapter,
    createOpenShellCloudRuntimeAdapter: deps.createOpenShellCloudRuntimeAdapter ?? createOpenShellCloudRuntimeAdapter,
    openShellRemoteGatewayRegistry: deps.openShellRemoteGatewayRegistry ?? new OpenShellRemoteGatewayRegistry(),
    openShellCloudGatewayRegistry: deps.openShellCloudGatewayRegistry ?? new OpenShellCloudGatewayRegistry(),
  };
}
