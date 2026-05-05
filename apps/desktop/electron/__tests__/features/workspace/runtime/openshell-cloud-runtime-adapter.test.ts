import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { OpenShellCloudGatewayEntry } from '@electron/features/workspace/runtime/openshell/cloud-gateway-registry';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  checkOpenShellCli: vi.fn(),
  pullWorkspaceFromSandbox: vi.fn(),
  pushWorkspaceToSandbox: vi.fn(),
  runOpenShell: vi.fn(),
  streamOpenShellLogs: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/health', () => ({
  checkOpenShellCli: mocks.checkOpenShellCli,
}));

vi.mock('@electron/features/workspace/runtime/openshell/sync', () => ({
  pullWorkspaceFromSandbox: mocks.pullWorkspaceFromSandbox,
  pushWorkspaceToSandbox: mocks.pushWorkspaceToSandbox,
}));

vi.mock('@electron/features/workspace/runtime/openshell/logs', () => ({
  streamOpenShellLogs: mocks.streamOpenShellLogs,
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', () => ({
  formatOpenShellFailure: (label: string, result: { stdout: string; stderr: string; exitCode: number }) => (
    `${label} failed with exit code ${result.exitCode}. ${result.stderr || result.stdout}`.trim()
  ),
  runOpenShell: mocks.runOpenShell,
}));

import {
  OPENSHELL_CLOUD_CAPABILITIES,
  createOpenShellCloudRuntimeAdapter,
} from '@electron/features/workspace/runtime/adapters/openshell-cloud-runtime-adapter';

describe('createOpenShellCloudRuntimeAdapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.checkOpenShellCli.mockResolvedValue({
      name: 'openshell-cli',
      ok: true,
      status: 'ready',
      message: 'OpenShell CLI detected: openshell 0.0.36',
      version: 'openshell 0.0.36',
      result: { stdout: 'openshell 0.0.36', stderr: '', exitCode: 0 },
    });
    mocks.pushWorkspaceToSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.pullWorkspaceFromSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.streamOpenShellLogs.mockReturnValue({
      stop: vi.fn(),
      onLine: vi.fn(),
      onError: vi.fn(),
    });
  });

  it('fails closed when cloudGatewayId is missing', async () => {
    const adapter = createAdapter({ runtimeConfig: { providerId: 'openshell-cloud' } });

    const result = await adapter.exec('uname -a', { cwd: '/tmp/ws' });
    const health = await adapter.health();

    expect(result).toEqual({
      stdout: '',
      stderr: 'OpenShell Cloud is not configured. Select a saved cloud gateway before running commands.',
      exitCode: 1,
    });
    expect(health.status).toBe('unavailable');
    expect(mocks.runOpenShell).not.toHaveBeenCalled();
  });

  it('fails closed when the registry entry is missing', async () => {
    const adapter = createAdapter({ gateways: [] });

    const result = await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(result.stderr).toBe('OpenShell Cloud gateway openshell-cloud-1 was not found. Select or recreate the cloud gateway before running commands.');
    expect(mocks.runOpenShell).not.toHaveBeenCalled();
  });

  it('registers/checks cloud gateway, ensures sandbox, syncs, executes, pulls, and persists state in order', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ready', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'not found', exitCode: 1 })
      .mockResolvedValueOnce({ stdout: 'created', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'Linux cloud', stderr: '', exitCode: 0 });
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-cloud',
      cloudGatewayId: 'openshell-cloud-1',
      experimental: true,
    });
    const adapter = createAdapter({ workspaceManager });

    const result = await adapter.exec('uname -a', { cwd: '/tmp/ws/src', timeoutMs: 2_500 });

    expect(result).toEqual({ stdout: 'Linux cloud', stderr: '', exitCode: 0 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(1, [
      'gateway', 'add', 'https://cloud.example', '--name', 'sero-cloud-dev',
    ], { timeoutMs: 30_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(2, [
      '--gateway', 'sero-cloud-dev', 'status',
    ], { timeoutMs: 10_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(3, [
      '--gateway', 'sero-cloud-dev', 'sandbox', 'get', 'sero-ws-1',
    ], { timeoutMs: 30_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-cloud-dev', 'sandbox', 'create', '--name', 'sero-ws-1',
      '--no-tty', '--', 'true',
    ], { timeoutMs: 120_000 });
    expect(mocks.pushWorkspaceToSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-cloud-dev',
      sandboxName: 'sero-ws-1',
      workspacePath: '/tmp/ws',
      runtimeWorkspacePath: '/sandbox/workspace/ws',
      timeoutMs: 2_500,
    });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(5, [
      '--gateway', 'sero-cloud-dev',
      'sandbox', 'exec', '-n', 'sero-ws-1',
      '--workdir', '/sandbox/workspace/ws/src',
      '--timeout', '3',
      '--no-tty', '--', 'sh', '-lc', encodedShellCommand('uname -a'),
    ], { timeoutMs: 2_500 });
    expect(mocks.pullWorkspaceFromSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-cloud-dev',
      sandboxName: 'sero-ws-1',
      workspacePath: '/tmp/ws',
      runtimeWorkspacePath: '/sandbox/workspace/ws',
      timeoutMs: 2_500,
    });
    expect(workspaceManager.setRuntimeConfig).toHaveBeenLastCalledWith('ws-1', expect.objectContaining({
      providerId: 'openshell-cloud',
      cloudGatewayId: 'openshell-cloud-1',
      gatewayName: 'sero-cloud-dev',
      sandboxName: 'sero-ws-1',
      runtimeWorkspacePath: '/sandbox/workspace/ws',
      idleTimeoutMinutes: 45,
      lastActivityAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    }));
  });

  it('keeps base64 command wrapping for multiline commands', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ready', stderr: '', exitCode: 0 })
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

  it('returns failures for push and pull errors', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ready', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1', stderr: '', exitCode: 0 });
    mocks.pushWorkspaceToSandbox.mockResolvedValueOnce({ stdout: '', stderr: 'upload failed', exitCode: 1 });
    const pushFailed = await createAdapter().exec('pwd', { cwd: '/tmp/ws' });
    expect(pushFailed.stderr).toContain('push workspace to OpenShell Cloud sandbox failed');

    vi.clearAllMocks();
    mocks.checkOpenShellCli.mockResolvedValue({ ok: true, message: 'ok' });
    mocks.pushWorkspaceToSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.pullWorkspaceFromSandbox.mockResolvedValueOnce({ stdout: '', stderr: 'download failed', exitCode: 1 });
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ready', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 });
    const pullFailed = await createAdapter().exec('pwd', { cwd: '/tmp/ws' });
    expect(pullFailed.stderr).toContain('pull workspace from OpenShell Cloud sandbox failed');
  });

  it('reports auth or gateway unavailable without falling back to host', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '401 login required', exitCode: 1 });
    const adapter = createAdapter();

    const result = await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(result.stderr).toContain('check OpenShell Cloud gateway sero-cloud-dev status failed');
    expect(result.stderr).toContain('401 login required');
    expect(mocks.pushWorkspaceToSandbox).not.toHaveBeenCalled();
  });

  it('uses custom sandbox and runtime workspace paths', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ready', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'custom', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 });
    const adapter = createAdapter({
      runtimeConfig: {
        providerId: 'openshell-cloud',
        cloudGatewayId: 'openshell-cloud-1',
        sandboxName: 'custom-sandbox',
        runtimeWorkspacePath: '/sandbox/workspace/custom',
        idleTimeoutMinutes: 12,
      },
    });

    await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-cloud-dev',
      'sandbox', 'exec', '-n', 'custom-sandbox',
      '--workdir', '/sandbox/workspace/custom',
      '--timeout', '120',
      '--no-tty', '--', 'sh', '-lc', encodedShellCommand('pwd'),
    ], { timeoutMs: undefined });
  });

  it('uses existing logs and port forwarding helpers with the cloud gateway', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'registered', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ready', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'forwarded http://127.0.0.1:5173', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    await adapter.streamLogs?.();
    const forwarded = await adapter.forwardPort?.(5173);

    expect(mocks.streamOpenShellLogs).toHaveBeenCalledWith({
      gatewayName: 'sero-cloud-dev',
      sandboxName: 'sero-ws-1',
    });
    expect(forwarded?.localUrl).toBe('http://127.0.0.1:5173');
  });

  it('deletes only the cloud sandbox on destroy', async () => {
    mocks.runOpenShell.mockResolvedValueOnce({ stdout: 'deleted', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    await adapter.destroy?.();

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-cloud-dev', 'sandbox', 'delete', 'sero-ws-1',
    ], { timeoutMs: 120_000 });
    expect(mocks.runOpenShell).not.toHaveBeenCalledWith(
      expect.arrayContaining(['gateway', 'delete']),
      { timeoutMs: 120_000 },
    );
    expect(OPENSHELL_CLOUD_CAPABILITIES.interactiveTerminal).toBe(false);
  });
});

const cloudGateway: OpenShellCloudGatewayEntry = {
  id: 'openshell-cloud-1',
  name: 'sero-cloud-dev',
  endpoint: 'https://cloud.example',
  authMode: 'browser',
  idleTimeoutMinutes: 45,
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

function encodedShellCommand(command: string): string {
  return `eval "$(printf %s '${Buffer.from(command, 'utf8').toString('base64')}' | base64 -d)"`;
}

function createAdapter(overrides: {
  gateway?: OpenShellCloudGatewayEntry;
  gateways?: OpenShellCloudGatewayEntry[];
  runtimeConfig?: WorkspaceRuntimeConfig;
  terminals?: TerminalManager;
  workspaceManager?: ReturnType<typeof createWorkspaceManager>;
} = {}) {
  const gatewayRegistry = {
    list: vi.fn(async () => overrides.gateways ?? [overrides.gateway ?? cloudGateway]),
  };
  const runtimeConfig = overrides.runtimeConfig ?? {
    providerId: 'openshell-cloud' as const,
    cloudGatewayId: 'openshell-cloud-1',
    experimental: true,
  };
  return createOpenShellCloudRuntimeAdapter({
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
