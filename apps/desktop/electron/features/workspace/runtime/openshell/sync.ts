import { runOpenShell, type OpenShellCommandResult } from './cli';
import { getOpenShellRuntimeWorkspacePath } from './path';

/**
 * OpenShell Phase 2.5 source of truth:
 * - Host workspace is the persisted authority between tool calls.
 * - Before runtime bash, upload host -> sandbox runtime workspace.
 * - During runtime bash, /sandbox/workspace/<basename> is authoritative.
 * - After runtime bash, download sandbox -> host so the host is current again.
 *
 * OpenShell read/write/edit must also use runtime-backed operations; never route
 * them to host file APIs because that would bypass the selected sandbox.
 */
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
