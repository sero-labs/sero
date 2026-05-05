import { runOpenShell, type OpenShellCommandResult } from './cli';
import { getOpenShellRuntimeWorkspacePath } from './path';

/**
 * OpenShell Phase 2.5 source of truth:
 * - Host workspace is the persisted authority between tool calls.
 * - Before runtime bash, upload host -> sandbox runtime workspace.
 * - During runtime bash, /sandbox/workspace/<basename> is authoritative.
 * - After runtime bash, download sandbox -> host so the host is current again.
 *
 * Do not route OpenShell read/write/edit to host tools; keep them blocked until
 * first-class runtime-backed file operations exist.
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
