import { runOpenShell, type OpenShellCommandResult } from './cli';
import { getOpenShellRuntimeWorkspacePath } from './path';

export interface OpenShellWorkspaceSyncInput {
  gatewayName: string;
  sandboxName: string;
  workspacePath: string;
  runtimeWorkspacePath?: string;
  timeoutMs?: number;
}

export function pushWorkspaceToSandbox(input: OpenShellWorkspaceSyncInput): Promise<OpenShellCommandResult> {
  const runtimeWorkspacePath = input.runtimeWorkspacePath ??
    getOpenShellRuntimeWorkspacePath(input.workspacePath);
  return runOpenShell([
    '--gateway', input.gatewayName,
    'sandbox', 'upload', input.sandboxName,
    input.workspacePath,
    runtimeWorkspacePath,
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
