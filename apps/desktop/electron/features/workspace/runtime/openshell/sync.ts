import { runOpenShell, type OpenShellCommandResult } from './cli';
import {
  OPENSHELL_WORKSPACE_PARENT,
  getOpenShellRuntimeWorkspacePath,
} from './path';

export interface OpenShellWorkspaceSyncInput {
  gatewayName: string;
  sandboxName: string;
  workspacePath: string;
  runtimeWorkspacePath?: string;
  timeoutMs?: number;
}

export function pushWorkspaceToSandbox(input: OpenShellWorkspaceSyncInput): Promise<OpenShellCommandResult> {
  return runOpenShell([
    '--gateway', input.gatewayName,
    'sandbox', 'upload', input.sandboxName,
    input.workspacePath,
    OPENSHELL_WORKSPACE_PARENT,
  ], { timeoutMs: input.timeoutMs });
}

export function pullWorkspaceFromSandbox(input: OpenShellWorkspaceSyncInput): Promise<OpenShellCommandResult> {
  const runtimeWorkspacePath = input.runtimeWorkspacePath ??
    getOpenShellRuntimeWorkspacePath(input.workspacePath);
  return runOpenShell([
    '--gateway', input.gatewayName,
    'sandbox', 'download', input.sandboxName,
    runtimeWorkspacePath,
    input.workspacePath,
  ], { timeoutMs: input.timeoutMs });
}
