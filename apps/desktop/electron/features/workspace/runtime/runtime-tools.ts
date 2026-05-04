import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { createWorkspaceCliTool } from '@electron/cli';
import type { ContainerManager } from '@electron/features/container';
import { containerManager } from '@electron/features/container/core/singleton';
import {
  createContainerTools,
  createHostCodingTools,
} from '@electron/features/container/tools';
import type { WorkspaceRuntimeFacade } from './types';

export interface RuntimeToolOptions {
  sessionId: string;
  containerCwd?: string;
  hostCwd?: string;
  forceHost?: boolean;
  deps?: Partial<RuntimeToolDependencies>;
}

interface RuntimeToolDependencies {
  containerManager: ContainerManager;
  createContainerTools(
    cm: ContainerManager,
    workspaceId: string,
    sessionId: string,
    containerCwd?: string,
  ): ToolDefinition[];
  createHostCodingTools(basedir: string): ToolDefinition[];
  createWorkspaceCliTool(workspaceId: string, sessionId: string): ToolDefinition;
}

export function createRuntimeCodingTools(
  runtime: WorkspaceRuntimeFacade,
  options: RuntimeToolOptions,
): ToolDefinition[] {
  const deps = resolveRuntimeToolDeps(options.deps);

  if (runtime.actualRuntime === 'container' && !options.forceHost) {
    return deps.createContainerTools(
      deps.containerManager,
      runtime.workspaceId,
      options.sessionId,
      options.containerCwd,
    );
  }

  return [
    ...deps.createHostCodingTools(options.hostCwd ?? runtime.workspacePath),
    deps.createWorkspaceCliTool(runtime.workspaceId, options.sessionId),
  ];
}

function resolveRuntimeToolDeps(
  deps: Partial<RuntimeToolDependencies> = {},
): RuntimeToolDependencies {
  return {
    containerManager: deps.containerManager ?? containerManager,
    createContainerTools: deps.createContainerTools ?? createContainerTools,
    createHostCodingTools: deps.createHostCodingTools ?? createHostCodingTools,
    createWorkspaceCliTool: deps.createWorkspaceCliTool ?? createWorkspaceCliTool,
  };
}
