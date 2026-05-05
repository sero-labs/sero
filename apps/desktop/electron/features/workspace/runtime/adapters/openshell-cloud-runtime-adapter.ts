import type { ExecResult } from '@electron/features/container/core/types';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';
import { formatOpenShellFailure, runOpenShell } from '../openshell/cli';
import {
  getCloudGatewayStatus,
  registerCloudGateway,
} from '../openshell/cloud-gateway';
import type { OpenShellCloudGatewayEntry } from '../openshell/cloud-gateway-registry';
import { checkOpenShellCli } from '../openshell/health';
import { streamOpenShellLogs, type OpenShellLogStream } from '../openshell/logs';
import { startOpenShellPortForward, type ForwardedPort } from '../openshell/ports';
import {
  normalizeOpenShellRuntimeWorkspacePath,
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
import { getDefaultOpenShellSandboxName } from './openshell-local-runtime-adapter';

const DEFAULT_TIMEOUT_MS = 120_000;

export const OPENSHELL_CLOUD_CAPABILITIES: RuntimeCapabilities = {
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

type OpenShellCloudRuntimeAdapter = Pick<
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

interface OpenShellCloudGatewayRegistryReader {
  list(): Promise<OpenShellCloudGatewayEntry[]>;
}

export interface OpenShellCloudRuntimeAdapterInput {
  workspaceId: string;
  workspacePath: string;
  terminals: TerminalManager;
  workspaceManager?: Partial<OpenShellWorkspaceConfigManager>;
  gatewayRegistry?: OpenShellCloudGatewayRegistryReader;
}

interface OpenShellCloudRuntimeState {
  gateway: OpenShellCloudGatewayEntry;
  gatewayName: string;
  sandboxName: string;
  runtimeWorkspacePath: string;
  cloudGatewayId: string;
  idleTimeoutMinutes: number;
}

interface RuntimeEnsureResult {
  ok: boolean;
  state?: OpenShellCloudRuntimeState;
  message?: string;
}

interface SandboxHealthResult {
  status: 'ready' | 'unavailable';
  message: string;
}

export function createOpenShellCloudRuntimeAdapter(
  input: OpenShellCloudRuntimeAdapterInput,
): OpenShellCloudRuntimeAdapter {
  return {
    providerId: 'openshell-cloud',
    actualRuntime: 'openshell-cloud',
    capabilities: OPENSHELL_CLOUD_CAPABILITIES,
    async health(): Promise<RuntimeHealth> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) return unavailable(resolved.message ?? 'OpenShell Cloud is not configured.');

      const cli = await checkOpenShellCli();
      if (!cli.ok) return unavailable(`OpenShell Cloud is experimental. ${cli.message}`);

      const registered = await registerCloudGateway(resolved.state.gateway);
      if (!registered.ok) return unavailable(registered.message);

      const gateway = await getCloudGatewayStatus(resolved.state.gateway);
      if (!gateway.ok) return unavailable(gateway.message);

      const sandbox = await checkSandbox(resolved.state.gatewayName, resolved.state.sandboxName);
      return {
        providerId: 'openshell-cloud',
        status: sandbox.status,
        message: `OpenShell Cloud is experimental and may incur external costs. Gateway ${resolved.state.gatewayName} is ready. ${sandbox.message}`,
      };
    },
    async exec(command: string, options: RuntimeExecOptions): Promise<ExecResult> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) return failureResult(resolved.message ?? 'OpenShell Cloud is not configured.');

      const runtimeCwd = toOpenShellWorkspacePath(
        input.workspacePath,
        options.cwd,
        resolved.state.runtimeWorkspacePath,
      );
      if (!runtimeCwd) return failureResult(`Cannot run command outside workspace root in OpenShell Cloud mode: ${options.cwd}`);

      const ready = await ensureOpenShellCloudRuntime(input, resolved.state);
      if (!ready.ok || !ready.state) return failureResult(ready.message ?? 'OpenShell Cloud is not ready.');

      const syncInput = {
        gatewayName: ready.state.gatewayName,
        sandboxName: ready.state.sandboxName,
        workspacePath: input.workspacePath,
        runtimeWorkspacePath: ready.state.runtimeWorkspacePath,
        timeoutMs: options.timeoutMs,
      };

      const push = await pushWorkspaceToSandbox(syncInput);
      if (push.exitCode !== 0) return failureResult(formatOpenShellFailure('push workspace to OpenShell Cloud sandbox', push));

      const exec = await runOpenShell([
        '--gateway', ready.state.gatewayName,
        'sandbox', 'exec', '-n', ready.state.sandboxName,
        '--workdir', runtimeCwd,
        '--timeout', String(toTimeoutSeconds(options.timeoutMs)),
        '--no-tty', '--', ...toOpenShellExecCommand(command),
      ], { timeoutMs: options.timeoutMs });

      const pull = await pullWorkspaceFromSandbox(syncInput);
      if (pull.exitCode !== 0) return failureResult(formatOpenShellFailure('pull workspace from OpenShell Cloud sandbox', pull));

      await persistRuntimeState(input, ready.state, new Date().toISOString());
      return exec;
    },
    async createTerminal(_options: RuntimeTerminalInput): Promise<RuntimeTerminalSession> {
      throw new Error('OpenShell Cloud does not support interactive PTY terminals. Use agent bash commands to run inside the cloud sandbox, or switch the workspace runtime to Host to open a host terminal.');
    },
    async streamLogs(): Promise<OpenShellLogStream> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) throw new Error(resolved.message ?? 'OpenShell Cloud is not configured.');
      return streamOpenShellLogs({
        gatewayName: resolved.state.gatewayName,
        sandboxName: resolved.state.sandboxName,
      });
    },
    async forwardPort(port: number): Promise<ForwardedPort> {
      const resolved = await resolveRuntimeState(input);
      if (!resolved.ok || !resolved.state) throw new Error(resolved.message ?? 'OpenShell Cloud is not configured.');
      const ready = await ensureOpenShellCloudRuntime(input, resolved.state);
      if (!ready.ok || !ready.state) throw new Error(ready.message ?? 'OpenShell Cloud is not ready.');
      return startOpenShellPortForward({
        gatewayName: ready.state.gatewayName,
        sandboxName: ready.state.sandboxName,
        port,
      });
    },
    async destroy(): Promise<void> {
      const state = await resolveDestroyRuntimeState(input);
      const result = await runOpenShell([
        '--gateway', state.gatewayName,
        'sandbox', 'delete', state.sandboxName,
      ], { timeoutMs: DEFAULT_TIMEOUT_MS });
      if (result.exitCode !== 0) throw new Error(formatOpenShellFailure('delete OpenShell Cloud sandbox', result));
    },
  };
}

async function ensureOpenShellCloudRuntime(
  input: OpenShellCloudRuntimeAdapterInput,
  state: OpenShellCloudRuntimeState,
): Promise<RuntimeEnsureResult> {
  const cli = await checkOpenShellCli();
  if (!cli.ok) return { ok: false, message: cli.message };

  const registered = await registerCloudGateway(state.gateway);
  if (!registered.ok) return { ok: false, message: registered.message };

  const gateway = await getCloudGatewayStatus(state.gateway);
  if (!gateway.ok) return { ok: false, message: gateway.message };

  const sandbox = await ensureSandbox(state.gatewayName, state.sandboxName);
  if (sandbox.exitCode !== 0) {
    return { ok: false, message: formatOpenShellFailure('ensure OpenShell Cloud sandbox', sandbox) };
  }

  await persistRuntimeState(input, state, new Date().toISOString());
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
    message: `Sandbox ${sandboxName} has not been created yet; it will be created on the next OpenShell Cloud command.`,
  };
}

async function resolveRuntimeState(
  input: OpenShellCloudRuntimeAdapterInput,
): Promise<RuntimeEnsureResult> {
  const config = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  if (!config?.cloudGatewayId) {
    return { ok: false, message: 'OpenShell Cloud is not configured. Select a saved cloud gateway before running commands.' };
  }
  if (!input.gatewayRegistry) {
    return { ok: false, message: 'OpenShell Cloud gateway registry is unavailable. Cannot run commands without a saved cloud gateway.' };
  }

  const gateways = await input.gatewayRegistry.list();
  const gateway = gateways.find((entry) => entry.id === config.cloudGatewayId);
  if (!gateway) {
    return { ok: false, message: `OpenShell Cloud gateway ${config.cloudGatewayId} was not found. Select or recreate the cloud gateway before running commands.` };
  }

  return { ok: true, state: toRuntimeState(input, config, gateway) };
}

async function resolveDestroyRuntimeState(
  input: OpenShellCloudRuntimeAdapterInput,
): Promise<Pick<OpenShellCloudRuntimeState, 'gatewayName' | 'sandboxName'>> {
  const config = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  if (config?.gatewayName) {
    return {
      gatewayName: config.gatewayName,
      sandboxName: config.sandboxName ?? getDefaultOpenShellSandboxName(input.workspaceId),
    };
  }

  const resolved = await resolveRuntimeState(input);
  if (!resolved.ok || !resolved.state) throw new Error(resolved.message ?? 'OpenShell Cloud is not configured.');
  return {
    gatewayName: resolved.state.gatewayName,
    sandboxName: resolved.state.sandboxName,
  };
}

function toRuntimeState(
  input: OpenShellCloudRuntimeAdapterInput,
  config: WorkspaceRuntimeConfig,
  gateway: OpenShellCloudGatewayEntry,
): OpenShellCloudRuntimeState {
  return {
    gateway,
    gatewayName: gateway.name,
    sandboxName: config.sandboxName ?? getDefaultOpenShellSandboxName(input.workspaceId),
    runtimeWorkspacePath: normalizeOpenShellRuntimeWorkspacePath(
      config.runtimeWorkspacePath,
      input.workspacePath,
    ),
    cloudGatewayId: gateway.id,
    idleTimeoutMinutes: config.idleTimeoutMinutes ?? gateway.idleTimeoutMinutes,
  };
}

async function persistRuntimeState(
  input: OpenShellCloudRuntimeAdapterInput,
  state: OpenShellCloudRuntimeState,
  lastActivityAt: string,
): Promise<void> {
  const current = await input.workspaceManager?.getRuntimeConfig?.(input.workspaceId);
  await input.workspaceManager?.setRuntimeConfig?.(input.workspaceId, {
    ...current,
    providerId: 'openshell-cloud',
    experimental: current?.experimental ?? true,
    cloudGatewayId: state.cloudGatewayId,
    gatewayName: state.gatewayName,
    sandboxName: state.sandboxName,
    runtimeWorkspacePath: state.runtimeWorkspacePath,
    idleTimeoutMinutes: state.idleTimeoutMinutes,
    lastActivityAt,
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
  return { providerId: 'openshell-cloud', status: 'unavailable', message };
}

function failureResult(stderr: string): ExecResult {
  return { stdout: '', stderr, exitCode: 1 };
}
