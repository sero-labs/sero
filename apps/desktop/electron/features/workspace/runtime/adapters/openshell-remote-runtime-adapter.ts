import type { ExecResult } from '@electron/features/container/core/types';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import { formatOpenShellFailure, runOpenShell } from '../openshell/cli';
import { checkOpenShellPrerequisites } from '../openshell/health';
import { streamOpenShellLogs, type OpenShellLogStream } from '../openshell/logs';
import { startOpenShellPortForward, type ForwardedPort } from '../openshell/ports';
import {
  normalizeOpenShellRuntimeWorkspacePath,
  toOpenShellWorkspacePath,
} from '../openshell/path';
import { startRemoteGateway } from '../openshell/remote-gateway';
import type { OpenShellRemoteGatewayEntry } from '../openshell/remote-gateway-registry';
import { checkRemoteDocker } from '../openshell/remote-ssh';
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
import { getDefaultOpenShellSandboxName } from './openshell-local-runtime-adapter';

const DEFAULT_TIMEOUT_MS = 120_000;

export const OPENSHELL_REMOTE_CAPABILITIES: RuntimeCapabilities = {
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

type OpenShellRemoteRuntimeAdapter = Pick<
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

interface OpenShellWorkspaceConfigManager {
  getRuntimeConfig(id: string): Promise<WorkspaceRuntimeConfig | undefined>;
  setRuntimeConfig(id: string, runtime: WorkspaceRuntimeConfig | undefined): Promise<void>;
}

interface OpenShellRemoteGatewayRegistryReader {
  list(): Promise<OpenShellRemoteGatewayEntry[]>;
}

export interface OpenShellRemoteRuntimeAdapterInput {
  workspaceId: string;
  workspacePath: string;
  terminals: TerminalManager;
  workspaceManager?: Partial<OpenShellWorkspaceConfigManager>;
  gatewayRegistry?: OpenShellRemoteGatewayRegistryReader;
}

interface OpenShellRemoteRuntimeState {
  gateway: OpenShellRemoteGatewayEntry;
  gatewayName: string;
  sandboxName: string;
  runtimeWorkspacePath: string;
  remoteGatewayId: string;
}

interface RuntimeEnsureResult {
  ok: boolean;
  state?: OpenShellRemoteRuntimeState;
  message?: string;
}

interface SandboxHealthResult {
  status: 'ready' | 'unavailable';
  message: string;
}

export function createOpenShellRemoteRuntimeAdapter(
  input: OpenShellRemoteRuntimeAdapterInput,
): OpenShellRemoteRuntimeAdapter {
  return {
    providerId: 'openshell-remote',
    actualRuntime: 'openshell-remote',
    capabilities: OPENSHELL_REMOTE_CAPABILITIES,
    async health(): Promise<RuntimeHealth> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) return unavailable(resolved.message ?? 'OpenShell Remote is not configured.');

      const prerequisites = await checkOpenShellPrerequisites();
      if (!prerequisites.ok) return unavailable(`OpenShell Remote is experimental. ${prerequisites.message}`);

      const docker = await checkRemoteDocker(resolved.state.gateway);
      if (!docker.ok) return unavailable(`OpenShell Remote is experimental. ${docker.message}`);

      const gateway = await runOpenShell(['--gateway', resolved.state.gatewayName, 'status'], {
        timeoutMs: 10_000,
      });
      if (gateway.exitCode !== 0) {
        return unavailable(`OpenShell Remote is experimental. Gateway ${resolved.state.gatewayName} is not reachable. ${formatOpenShellFailure('check OpenShell Remote gateway', gateway)}`);
      }

      const sandbox = await checkSandbox(resolved.state.gatewayName, resolved.state.sandboxName);
      return {
        providerId: 'openshell-remote',
        status: sandbox.status,
        message: `OpenShell Remote is experimental. Gateway ${resolved.state.gatewayName} is ready for ${resolved.state.gateway.sshHost}. ${sandbox.message}`,
      };
    },
    async exec(command: string, options: RuntimeExecOptions): Promise<ExecResult> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) return failureResult(resolved.message ?? 'OpenShell Remote is not configured.');

      const runtimeCwd = toOpenShellWorkspacePath(
        input.workspacePath,
        options.cwd,
        resolved.state.runtimeWorkspacePath,
      );
      if (!runtimeCwd) return failureResult(`Cannot run command outside workspace root in OpenShell Remote mode: ${options.cwd}`);

      const ready = await ensureOpenShellRemoteRuntime(input, resolved.state);
      if (!ready.ok || !ready.state) return failureResult(ready.message ?? 'OpenShell Remote is not ready.');

      const syncInput = {
        gatewayName: ready.state.gatewayName,
        sandboxName: ready.state.sandboxName,
        workspacePath: input.workspacePath,
        runtimeWorkspacePath: ready.state.runtimeWorkspacePath,
        timeoutMs: options.timeoutMs,
      };

      const push = await pushWorkspaceToSandbox(syncInput);
      if (push.exitCode !== 0) return failureResult(formatOpenShellFailure('push workspace to OpenShell remote sandbox', push));

      const exec = await runOpenShell([
        '--gateway', ready.state.gatewayName,
        'sandbox', 'exec', '-n', ready.state.sandboxName,
        '--workdir', runtimeCwd,
        '--timeout', String(toTimeoutSeconds(options.timeoutMs)),
        '--no-tty', '--', ...toOpenShellExecCommand(command),
      ], { timeoutMs: options.timeoutMs });

      const pull = await pullWorkspaceFromSandbox(syncInput);
      if (pull.exitCode !== 0) return failureResult(formatOpenShellFailure('pull workspace from OpenShell remote sandbox', pull));

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
        fallbackReason: 'OpenShell Remote does not support interactive PTY terminals yet; using a host terminal for UI compatibility.',
      };
    },
    async streamLogs(): Promise<OpenShellLogStream> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) throw new Error(resolved.message ?? 'OpenShell Remote is not configured.');
      return streamOpenShellLogs({
        gatewayName: resolved.state.gatewayName,
        sandboxName: resolved.state.sandboxName,
      });
    },
    async forwardPort(port: number): Promise<ForwardedPort> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) throw new Error(resolved.message ?? 'OpenShell Remote is not configured.');
      const ready = await ensureOpenShellRemoteRuntime(input, resolved.state);
      if (!ready.ok || !ready.state) throw new Error(ready.message ?? 'OpenShell Remote is not ready.');
      return startOpenShellPortForward({
        gatewayName: ready.state.gatewayName,
        sandboxName: ready.state.sandboxName,
        port,
      });
    },
    async destroy(): Promise<void> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) throw new Error(resolved.message ?? 'OpenShell Remote is not configured.');
      const result = await runOpenShell([
        '--gateway', resolved.state.gatewayName,
        'sandbox', 'delete', resolved.state.sandboxName,
      ], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) throw new Error(formatOpenShellFailure('delete OpenShell Remote sandbox', result));
    },
  };
}

async function ensureOpenShellRemoteRuntime(
  input: OpenShellRemoteRuntimeAdapterInput,
  state: OpenShellRemoteRuntimeState,
): Promise<RuntimeEnsureResult> {
  const prerequisites = await checkOpenShellPrerequisites();
  if (!prerequisites.ok) return { ok: false, message: prerequisites.message };

  const gateway = await startRemoteGateway(state.gateway);
  if (!gateway.ok) return { ok: false, message: gateway.message };

  const sandbox = await ensureSandbox(state.gatewayName, state.sandboxName);
  if (sandbox.exitCode !== 0) {
    return { ok: false, message: formatOpenShellFailure('ensure OpenShell Remote sandbox', sandbox) };
  }

  await persistRuntimeState(input, state);
  return { ok: true, state };
}

async function ensureSandbox(gatewayName: string, sandboxName: string): Promise<ExecResult> {
  const existing = await runOpenShell([
    '--gateway', gatewayName,
    'sandbox', 'get', sandboxName,
  ], { timeoutMs: 30_000 });
  if (existing.exitCode === 0) return existing;

  return runOpenShell([
    '--gateway', gatewayName,
    'sandbox', 'create', '--name', sandboxName,
    '--no-tty', '--', 'true',
  ], { timeoutMs: DEFAULT_TIMEOUT_MS });
}

async function checkSandbox(gatewayName: string, sandboxName: string): Promise<SandboxHealthResult> {
  const sandbox = await runOpenShell([
    '--gateway', gatewayName,
    'sandbox', 'get', sandboxName,
  ], { timeoutMs: 30_000 });

  if (sandbox.exitCode === 0) {
    return { status: 'ready', message: `Sandbox ${sandboxName} is available for this workspace.` };
  }

  return {
    status: 'ready',
    message: `Sandbox ${sandboxName} has not been created yet; it will be created on the next OpenShell Remote command.`,
  };
}

async function resolveRuntimeState(
  input: OpenShellRemoteRuntimeAdapterInput,
): Promise<RuntimeEnsureResult> {
  const config = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  if (!config?.remoteGatewayId) {
    return { ok: false, message: 'OpenShell Remote is not configured. Select a saved SSH remote gateway before running commands.' };
  }
  if (!input.gatewayRegistry) {
    return { ok: false, message: 'OpenShell Remote gateway registry is unavailable. Cannot run commands without a saved gateway.' };
  }

  const gateways = await input.gatewayRegistry.list();
  const gateway = gateways.find((entry) => entry.id === config.remoteGatewayId);
  if (!gateway) {
    return { ok: false, message: `OpenShell Remote gateway ${config.remoteGatewayId} was not found. Select or recreate the remote gateway before running commands.` };
  }

  return {
    ok: true,
    state: {
      gateway,
      gatewayName: gateway.name,
      sandboxName: config.sandboxName ?? getDefaultOpenShellSandboxName(input.workspaceId),
      runtimeWorkspacePath: normalizeOpenShellRuntimeWorkspacePath(
        config.runtimeWorkspacePath,
        input.workspacePath,
      ),
      remoteGatewayId: gateway.id,
    },
  };
}

async function persistRuntimeState(
  input: OpenShellRemoteRuntimeAdapterInput,
  state: OpenShellRemoteRuntimeState,
): Promise<void> {
  const current = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  await input.workspaceManager?.setRuntimeConfig?.(input.workspaceId, {
    ...current,
    providerId: 'openshell-remote',
    experimental: current?.experimental ?? true,
    remoteGatewayId: state.remoteGatewayId,
    gatewayName: state.gatewayName,
    sandboxName: state.sandboxName,
    runtimeWorkspacePath: state.runtimeWorkspacePath,
  });
}

function toTimeoutSeconds(timeoutMs: number | undefined): number {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS / 1000;
  if (timeoutMs === 0) return 0;
  return Math.max(1, Math.ceil(timeoutMs / 1000));
}

function toOpenShellExecCommand(command: string): string[] {
  const encodedCommand = Buffer.from(command, 'utf8').toString('base64');
  return ['sh', '-lc', `eval "$(printf %s '${encodedCommand}' | base64 -d)"`];
}

function unavailable(message: string): RuntimeHealth {
  return { providerId: 'openshell-remote', status: 'unavailable', message };
}

function failureResult(stderr: string): ExecResult {
  return { stdout: '', stderr, exitCode: 1 };
}
