import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { OpenShellRemoteGatewayEntry } from '@electron/features/workspace/runtime/openshell/remote-gateway-registry';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  checkOpenShellPrerequisites: vi.fn(),
  pullWorkspaceFromSandbox: vi.fn(),
  pushWorkspaceToSandbox: vi.fn(),
  runCommand: vi.fn(),
  runOpenShell: vi.fn(),
  streamOpenShellLogs: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/health', () => ({
  checkOpenShellPrerequisites: mocks.checkOpenShellPrerequisites,
}));

vi.mock('@electron/features/workspace/runtime/openshell/sync', () => ({
  pullWorkspaceFromSandbox: mocks.pullWorkspaceFromSandbox,
  pushWorkspaceToSandbox: mocks.pushWorkspaceToSandbox,
}));

vi.mock('@electron/features/workspace/runtime/openshell/logs', () => ({
  streamOpenShellLogs: mocks.streamOpenShellLogs,
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/features/workspace/runtime/openshell/cli')>();
  return {
    ...actual,
    runCommand: mocks.runCommand,
    runOpenShell: mocks.runOpenShell,
  };
});

import {
  OPENSHELL_REMOTE_CAPABILITIES,
  createOpenShellRemoteRuntimeAdapter,
} from '@electron/features/workspace/runtime/adapters/openshell-remote-runtime-adapter';

describe('createOpenShellRemoteRuntimeAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkOpenShellPrerequisites.mockResolvedValue({
      ok: true,
      status: 'ready',
      message: 'OpenShell prerequisites are ready.',
      checks: [],
    });
    mocks.pushWorkspaceToSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.pullWorkspaceFromSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.streamOpenShellLogs.mockReturnValue({
      stop: vi.fn(),
      onLine: vi.fn(),
      onError: vi.fn(),
    });
  });

  it('reports missing remote config without falling back to host', async () => {
    const adapter = createAdapter({ runtimeConfig: { providerId: 'openshell-remote' } });

    const result = await adapter.exec('uname -a', { cwd: '/tmp/ws' });
    const health = await adapter.health();

    expect(result).toEqual({
      stdout: '',
      stderr: 'OpenShell Remote is not configured. Select a saved SSH remote gateway before running commands.',
      exitCode: 1,
    });
    expect(health.status).toBe('unavailable');
    expect(mocks.runOpenShell).not.toHaveBeenCalled();
    expect(mocks.runCommand).not.toHaveBeenCalled();
  });

  it('reports missing registry entries clearly', async () => {
    const adapter = createAdapter({ gateways: [] });

    const health = await adapter.health();

    expect(health).toEqual({
      providerId: 'openshell-remote',
      status: 'unavailable',
      message: 'OpenShell Remote gateway remote-1 was not found. Select or recreate the remote gateway before running commands.',
    });
    expect(mocks.runOpenShell).not.toHaveBeenCalled();
  });

  it('reports SSH and Docker preflight failures in health', async () => {
    mocks.runCommand.mockResolvedValueOnce({ stdout: '', stderr: 'Permission denied', exitCode: 255 });
    const adapter = createAdapter();

    const health = await adapter.health();

    expect(mocks.runCommand).toHaveBeenCalledWith(
      'remote Docker prerequisite',
      'ssh',
      [
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=8',
        'dev@example',
        'docker', 'info', '--format', '{{json .ServerVersion}}',
      ],
      { timeoutMs: 15_000 },
    );
    expect(health.providerId).toBe('openshell-remote');
    expect(health.status).toBe('unavailable');
    expect(health.message).toContain('Remote Docker is unavailable');
    expect(health.message).toContain('Permission denied');
  });

  it('reports gateway failure and missing sandbox state in health', async () => {
    mocks.runCommand.mockResolvedValueOnce({ stdout: '"24.0.0"', stderr: '', exitCode: 0 });
    mocks.runOpenShell.mockResolvedValueOnce({ stdout: '', stderr: 'connection refused', exitCode: 1 });
    const gatewayFailure = createAdapter();

    const failed = await gatewayFailure.health();

    expect(failed.status).toBe('unavailable');
    expect(failed.message).toContain('Gateway sero-remote-dev is not reachable');

    vi.clearAllMocks();
    mocks.checkOpenShellPrerequisites.mockResolvedValue({ ok: true, status: 'ready', message: 'ready', checks: [] });
    mocks.runCommand.mockResolvedValueOnce({ stdout: '"24.0.0"', stderr: '', exitCode: 0 });
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 });
    const missingSandbox = createAdapter();

    const ready = await missingSandbox.health();

    expect(ready.status).toBe('ready');
    expect(ready.message).toContain('Sandbox sero-ws-1 has not been created yet');
  });

  it('ensures remote gateway and sandbox, syncs, executes, and pulls in order', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 })
      .mockResolvedValueOnce({ stdout: 'created', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'Linux remote', stderr: '', exitCode: 0 });
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-remote',
      remoteGatewayId: 'remote-1',
      experimental: true,
    });
    const adapter = createAdapter({ workspaceManager });

    const result = await adapter.exec('uname -a', { cwd: '/tmp/ws/src', timeoutMs: 2_500 });

    expect(result).toEqual({ stdout: 'Linux remote', stderr: '', exitCode: 0 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(1, [
      'gateway', 'start',
      '--name', 'sero-remote-dev',
      '--remote', 'dev@example',
      '--port', '8080',
    ], { timeoutMs: 120_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(2, [
      'gateway', 'select', 'sero-remote-dev',
    ], { timeoutMs: 10_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(3, [
      '--gateway', 'sero-remote-dev',
      'sandbox', 'get', 'sero-ws-1',
    ], { timeoutMs: 30_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-remote-dev',
      'sandbox', 'create', '--name', 'sero-ws-1',
      '--no-tty', '--', 'true',
    ], { timeoutMs: 120_000 });
    expect(mocks.pushWorkspaceToSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-remote-dev',
      sandboxName: 'sero-ws-1',
      workspacePath: '/tmp/ws',
      runtimeWorkspacePath: '/sandbox/workspace/ws',
      timeoutMs: 2_500,
    });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(5, [
      '--gateway', 'sero-remote-dev',
      'sandbox', 'exec', '-n', 'sero-ws-1',
      '--workdir', '/sandbox/workspace/ws/src',
      '--timeout', '3',
      '--no-tty', '--', 'sh', '-lc', encodedShellCommand('uname -a'),
    ], { timeoutMs: 2_500 });
    expect(mocks.pullWorkspaceFromSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-remote-dev',
      sandboxName: 'sero-ws-1',
      workspacePath: '/tmp/ws',
      runtimeWorkspacePath: '/sandbox/workspace/ws',
      timeoutMs: 2_500,
    });
    expect(mocks.runCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      'ssh',
      expect.arrayContaining(['uname', '-a']),
      expect.anything(),
    );
    expect(workspaceManager.setRuntimeConfig).toHaveBeenCalledWith('ws-1', {
      providerId: 'openshell-remote',
      experimental: true,
      remoteGatewayId: 'remote-1',
      gatewayName: 'sero-remote-dev',
      sandboxName: 'sero-ws-1',
      runtimeWorkspacePath: '/sandbox/workspace/ws',
    });
  });

  it('uses configured sandbox names and optional SSH key paths', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'custom-sandbox', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 });
    const adapter = createAdapter({
      gateway: { ...remoteGateway, sshKeyPath: '/Users/me/.ssh/id_ed25519' },
      runtimeConfig: {
        providerId: 'openshell-remote',
        remoteGatewayId: 'remote-1',
        sandboxName: 'custom-sandbox',
        runtimeWorkspacePath: '/sandbox/workspace/custom',
        experimental: true,
      },
    });

    await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(1, [
      'gateway', 'start',
      '--name', 'sero-remote-dev',
      '--remote', 'dev@example',
      '--ssh-key', '/Users/me/.ssh/id_ed25519',
      '--port', '8080',
    ], { timeoutMs: 120_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-remote-dev',
      'sandbox', 'exec', '-n', 'custom-sandbox',
      '--workdir', '/sandbox/workspace/custom',
      '--timeout', '120',
      '--no-tty', '--', 'sh', '-lc', encodedShellCommand('pwd'),
    ], { timeoutMs: undefined });
  });

  it('keeps base64 command wrapping for multiline commands', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    await adapter.exec('echo one\necho two', { cwd: '/tmp/ws' });

    const execArgs = mocks.runOpenShell.mock.calls[3]?.[0] as string[];
    expect(execArgs.slice(-3)).toEqual([
      'sh',
      '-lc',
      encodedShellCommand('echo one\necho two'),
    ]);
    expect(execArgs.at(-1)).not.toMatch(/[\n\r]/);
  });

  it('uses existing log streaming and port forwarding helpers with the remote gateway', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'forwarded http://127.0.0.1:5173', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    await adapter.streamLogs?.();
    const forwarded = await adapter.forwardPort?.(5173);

    expect(mocks.streamOpenShellLogs).toHaveBeenCalledWith({
      gatewayName: 'sero-remote-dev',
      sandboxName: 'sero-ws-1',
    });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-remote-dev',
      'forward', 'start', '5173', 'sero-ws-1', '-d',
    ], { timeoutMs: 30_000 });
    expect(forwarded).toEqual({
      runtimePort: 5173,
      localPort: 5173,
      localUrl: 'http://127.0.0.1:5173',
      status: 'ready',
    });
  });

  it('deletes only the remote sandbox on destroy', async () => {
    mocks.runOpenShell.mockResolvedValueOnce({ stdout: 'deleted', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    await adapter.destroy?.();

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-remote-dev',
      'sandbox', 'delete', 'sero-ws-1',
    ], { timeoutMs: 120_000 });
    expect(mocks.runOpenShell).not.toHaveBeenCalledWith(
      expect.arrayContaining(['gateway', 'delete']),
      expect.anything(),
    );
  });

  it('returns a host terminal with an explicit OpenShell Remote fallback reason', async () => {
    const pty = { pid: 123 };
    const terminals = createTerminals(pty);
    const adapter = createAdapter({ terminals });

    const session = await adapter.createTerminal({ terminalId: 'term-1', cols: 100, rows: 40 });

    expect(terminals.createHostTerminal).toHaveBeenCalledWith('ws-1', 'term-1', '/tmp/ws', 100, 40);
    expect(session).toEqual({
      pty,
      runtime: 'host',
      fallbackReason: 'OpenShell Remote does not support interactive PTY terminals yet; using a host terminal for UI compatibility.',
    });
    expect(OPENSHELL_REMOTE_CAPABILITIES.interactiveTerminal).toBe(false);
  });
});

const remoteGateway: OpenShellRemoteGatewayEntry = {
  id: 'remote-1',
  name: 'sero-remote-dev',
  sshHost: 'dev@example',
  port: 8080,
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

function encodedShellCommand(command: string): string {
  return `eval "$(printf %s '${Buffer.from(command, 'utf8').toString('base64')}' | base64 -d)"`;
}

function createAdapter(overrides: {
  gateway?: OpenShellRemoteGatewayEntry;
  gateways?: OpenShellRemoteGatewayEntry[];
  runtimeConfig?: WorkspaceRuntimeConfig;
  terminals?: TerminalManager;
  workspaceManager?: ReturnType<typeof createWorkspaceManager>;
} = {}) {
  const gatewayRegistry = {
    list: vi.fn(async () => overrides.gateways ?? [overrides.gateway ?? remoteGateway]),
  };
  const runtimeConfig = overrides.runtimeConfig ?? {
    providerId: 'openshell-remote' as const,
    remoteGatewayId: 'remote-1',
    experimental: true,
  };
  return createOpenShellRemoteRuntimeAdapter({
    workspaceId: 'ws-1',
    workspacePath: '/tmp/ws',
    terminals: overrides.terminals ?? createTerminals({ pid: 1 }),
    workspaceManager: overrides.workspaceManager ?? createWorkspaceManager(runtimeConfig),
    gatewayRegistry,
  });
}

function createWorkspaceManager(runtimeConfig?: WorkspaceRuntimeConfig) {
  return {
    getRuntimeConfig: vi.fn(async () => runtimeConfig),
    setRuntimeConfig: vi.fn(async () => undefined),
  };
}

function createTerminals(pty: unknown): TerminalManager {
  return {
    createHostTerminal: vi.fn(() => pty),
  } as unknown as TerminalManager;
}
