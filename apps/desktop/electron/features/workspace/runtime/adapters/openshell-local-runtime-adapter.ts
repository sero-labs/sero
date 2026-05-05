import type { ExecResult } from '@electron/features/container/core/types';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import { formatOpenShellFailure, runOpenShell } from '../openshell/cli';
import { checkOpenShellPrerequisites } from '../openshell/health';
import { streamOpenShellLogs, type OpenShellLogStream } from '../openshell/logs';
import {
  getOpenShellRuntimeWorkspacePath,
  toOpenShellWorkspacePath,
} from '../openshell/path';
import {
  pullWorkspaceFromSandbox,
  pushWorkspaceToSandbox,
} from '../openshell/sync';
import type {
  RuntimeCapabilities,
  RuntimeExecOptions,
  RuntimeHealth,
  RuntimeTerminalInput,
  RuntimeTerminalSession,
  WorkspaceRuntimeFacade,
} from '../types';

const DEFAULT_GATEWAY_NAME = 'sero-local';
const DEFAULT_TIMEOUT_MS = 120_000;

export const OPENSHELL_LOCAL_CAPABILITIES: RuntimeCapabilities = {
  exec: true,
  interactiveTerminal: false,
  directFileRead: false,
  directFileWrite: false,
  fileUpload: true,
  fileDownload: true,
  managedDevServers: true,
  browserAutomation: false,
  portDiscovery: false,
  portForward: true,
  logStream: true,
};

type OpenShellLocalRuntimeAdapter = Pick<
  WorkspaceRuntimeFacade,
  | 'providerId'
  | 'actualRuntime'
  | 'capabilities'
  | 'health'
  | 'exec'
  | 'createTerminal'
  | 'streamLogs'
  | 'destroy'
>;

interface OpenShellWorkspaceConfigManager {
  getRuntimeConfig(id: string): Promise<WorkspaceRuntimeConfig | undefined>;
  setRuntimeConfig(id: string, runtime: WorkspaceRuntimeConfig | undefined): Promise<void>;
}

interface OpenShellLocalRuntimeAdapterInput {
  workspaceId: string;
  workspacePath: string;
  terminals: TerminalManager;
  workspaceManager?: Partial<OpenShellWorkspaceConfigManager>;
}

interface OpenShellRuntimeState {
  gatewayName: string;
  sandboxName: string;
  runtimeWorkspacePath: string;
}

interface RuntimeEnsureResult {
  ok: boolean;
  state?: OpenShellRuntimeState;
  message?: string;
}

export function createOpenShellLocalRuntimeAdapter(
  input: OpenShellLocalRuntimeAdapterInput,
): OpenShellLocalRuntimeAdapter {
  return {
    providerId: 'openshell-local',
    actualRuntime: 'openshell-local',
    capabilities: OPENSHELL_LOCAL_CAPABILITIES,
    async health(): Promise<RuntimeHealth> {
      const state = await resolveRuntimeState(input);
      const prerequisites = await checkOpenShellPrerequisites();
      if (!prerequisites.ok) {
        return {
          providerId: 'openshell-local',
          status: 'unavailable',
          message: `OpenShell Local is experimental. ${prerequisites.message}`,
        };
      }

      const gateway = await runOpenShell(['--gateway', state.gatewayName, 'status'], {
        timeoutMs: 10_000,
      });
      if (gateway.exitCode !== 0) {
        return {
          providerId: 'openshell-local',
          status: 'unavailable',
          message: `OpenShell Local is experimental. Gateway ${state.gatewayName} is not reachable. ${formatOpenShellFailure('check OpenShell gateway', gateway)}`,
        };
      }

      return {
        providerId: 'openshell-local',
        status: 'ready',
        message: `OpenShell Local is experimental. Gateway ${state.gatewayName} is ready; sandbox ${state.sandboxName} will be used for this workspace.`,
      };
    },
    async exec(command: string, options: RuntimeExecOptions): Promise<ExecResult> {
      const runtimeCwd = toOpenShellWorkspacePath(input.workspacePath, options.cwd);
      if (!runtimeCwd) return outsideWorkspaceResult(options.cwd);

      const ready = await ensureOpenShellRuntime(input);
      if (!ready.ok || !ready.state) return failureResult(ready.message ?? 'OpenShell Local is not ready.');

      const syncInput = {
        gatewayName: ready.state.gatewayName,
        sandboxName: ready.state.sandboxName,
        workspacePath: input.workspacePath,
        runtimeWorkspacePath: ready.state.runtimeWorkspacePath,
        timeoutMs: options.timeoutMs,
      };

      const push = await pushWorkspaceToSandbox(syncInput);
      if (push.exitCode !== 0) return failureResult(formatOpenShellFailure('push workspace to OpenShell sandbox', push));

      const exec = await runOpenShell([
        '--gateway', ready.state.gatewayName,
        'sandbox', 'exec', '-n', ready.state.sandboxName,
        '--workdir', runtimeCwd,
        '--timeout', String(toTimeoutSeconds(options.timeoutMs)),
        '--no-tty', '--', 'sh', '-lc', command,
      ], { timeoutMs: options.timeoutMs });

      const pull = await pullWorkspaceFromSandbox(syncInput);
      if (pull.exitCode !== 0) return failureResult(formatOpenShellFailure('pull workspace from OpenShell sandbox', pull));

      return exec;
    },
    async createTerminal(options: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
      const pty = input.terminals.createHostTerminal(
        input.workspaceId,
        options.terminalId,
        input.workspacePath,
        options.cols,
        options.rows,
      );
      return {
        pty,
        runtime: 'host',
        fallbackReason: 'OpenShell Local does not support interactive PTY terminals yet; using a host terminal for UI compatibility.',
      };
    },
    async streamLogs(): Promise<OpenShellLogStream> {
      const state = await resolveRuntimeState(input);
      return streamOpenShellLogs({
        gatewayName: state.gatewayName,
        sandboxName: state.sandboxName,
      });
    },
    async destroy(): Promise<void> {
      const state = await resolveRuntimeState(input);
      const result = await runOpenShell([
        '--gateway', state.gatewayName,
        'sandbox', 'delete', state.sandboxName,
      ], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) {
        throw new Error(formatOpenShellFailure('delete OpenShell sandbox', result));
      }
    },
  };
}

async function ensureOpenShellRuntime(
  input: OpenShellLocalRuntimeAdapterInput,
): Promise<RuntimeEnsureResult> {
  const state = await resolveRuntimeState(input);
  const prerequisites = await checkOpenShellPrerequisites();
  if (!prerequisites.ok) return { ok: false, message: prerequisites.message };

  const gateway = await ensureGateway(state.gatewayName);
  if (gateway.exitCode !== 0) {
    return {
      ok: false,
      message: `Gateway ${state.gatewayName} is unavailable. ${formatOpenShellFailure('ensure OpenShell gateway', gateway)}`,
    };
  }

  const sandbox = await ensureSandbox(input.workspaceId, state.gatewayName, state.sandboxName);
  if (sandbox.exitCode !== 0) {
    return {
      ok: false,
      message: formatOpenShellFailure('ensure OpenShell sandbox', sandbox),
    };
  }

  await persistRuntimeState(input, state);
  return { ok: true, state };
}

async function ensureGateway(gatewayName: string): Promise<ExecResult> {
  const start = await runOpenShell(['gateway', 'start', '--name', gatewayName], {
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
  if (start.exitCode !== 0) return start;
  return runOpenShell(['gateway', 'select', gatewayName], { timeoutMs: 10_000 });
}

async function ensureSandbox(
  workspaceId: string,
  gatewayName: string,
  sandboxName: string,
): Promise<ExecResult> {
  const label = `sero.workspaceId=${workspaceId}`;
  const list = await runOpenShell([
    '--gateway', gatewayName,
    'sandbox', 'list', '--names', '--selector', label,
  ], { timeoutMs: 30_000 });
  if (list.exitCode !== 0) return list;
  if (list.stdout.split(/\r?\n/).map((line) => line.trim()).includes(sandboxName)) {
    return list;
  }

  return runOpenShell([
    '--gateway', gatewayName,
    'sandbox', 'create', '--name', sandboxName,
    '--label', label,
  ], { timeoutMs: DEFAULT_TIMEOUT_MS });
}

async function resolveRuntimeState(
  input: OpenShellLocalRuntimeAdapterInput,
): Promise<OpenShellRuntimeState> {
  const config = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  return {
    gatewayName: config?.gatewayName ?? DEFAULT_GATEWAY_NAME,
    sandboxName: config?.sandboxName ?? getDefaultSandboxName(input.workspaceId),
    runtimeWorkspacePath: config?.runtimeWorkspacePath ??
      getOpenShellRuntimeWorkspacePath(input.workspacePath),
  };
}

async function persistRuntimeState(
  input: OpenShellLocalRuntimeAdapterInput,
  state: OpenShellRuntimeState,
): Promise<void> {
  const current = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  await input.workspaceManager?.setRuntimeConfig?.(input.workspaceId, {
    ...current,
    providerId: 'openshell-local',
    experimental: current?.experimental ?? true,
    gatewayName: state.gatewayName,
    sandboxName: state.sandboxName,
    runtimeWorkspacePath: state.runtimeWorkspacePath,
  });
}

export function getDefaultOpenShellSandboxName(workspaceId: string): string {
  return getDefaultSandboxName(workspaceId);
}

function getDefaultSandboxName(workspaceId: string): string {
  const sanitized = workspaceId.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `sero-${sanitized || 'workspace'}`;
}

function toTimeoutSeconds(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS / 1000;
  if (timeoutMs === 0) return 0;
  return Math.max(1, Math.ceil(timeoutMs / 1000));
}

function outsideWorkspaceResult(cwd: string): ExecResult {
  return failureResult(`Cannot run command outside workspace root in OpenShell Local mode: ${cwd}`);
}

function failureResult(stderr: string): ExecResult {
  return { stdout: '', stderr, exitCode: 1 };
}
