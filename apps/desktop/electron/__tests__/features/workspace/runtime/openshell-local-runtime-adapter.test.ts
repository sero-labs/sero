import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  checkOpenShellPrerequisites: vi.fn(),
  pullWorkspaceFromSandbox: vi.fn(),
  pushWorkspaceToSandbox: vi.fn(),
  runOpenShell: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/health', () => ({
  checkOpenShellPrerequisites: mocks.checkOpenShellPrerequisites,
}));

vi.mock('@electron/features/workspace/runtime/openshell/sync', () => ({
  pullWorkspaceFromSandbox: mocks.pullWorkspaceFromSandbox,
  pushWorkspaceToSandbox: mocks.pushWorkspaceToSandbox,
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/features/workspace/runtime/openshell/cli')>();
  return {
    ...actual,
    runOpenShell: mocks.runOpenShell,
  };
});

import {
  OPENSHELL_LOCAL_CAPABILITIES,
  createOpenShellLocalRuntimeAdapter,
  getDefaultOpenShellSandboxName,
} from '@electron/features/workspace/runtime/adapters/openshell-local-runtime-adapter';

describe('createOpenShellLocalRuntimeAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkOpenShellPrerequisites.mockResolvedValue({
      ok: true,
      status: 'ready',
      message: 'OpenShell Local prerequisites are ready.',
      checks: [],
    });
    mocks.pushWorkspaceToSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.pullWorkspaceFromSandbox.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
  });

  it('reports missing prerequisites clearly in health', async () => {
    mocks.checkOpenShellPrerequisites.mockResolvedValue({
      ok: false,
      status: 'unavailable',
      message: 'OpenShell CLI not found.',
      checks: [],
    });
    const adapter = createAdapter();

    const health = await adapter.health();

    expect(health).toEqual({
      providerId: 'openshell-local',
      status: 'unavailable',
      message: 'OpenShell Local is experimental. OpenShell CLI not found.',
    });
  });

  it('reports an unreachable gateway clearly in health', async () => {
    mocks.runOpenShell.mockResolvedValueOnce({
      stdout: '',
      stderr: 'connection refused',
      exitCode: 1,
    });
    const adapter = createAdapter();

    const health = await adapter.health();

    expect(mocks.runOpenShell).toHaveBeenCalledWith(['--gateway', 'sero-local', 'status'], {
      timeoutMs: 10_000,
    });
    expect(health.providerId).toBe('openshell-local');
    expect(health.status).toBe('unavailable');
    expect(health.message).toContain('Gateway sero-local is not reachable');
    expect(health.message).toContain('connection refused');
  });

  it('reports ready health with experimental context and sandbox state', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1\n', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    const health = await adapter.health();

    expect(health).toMatchObject({
      providerId: 'openshell-local',
      status: 'ready',
    });
    expect(health.message).toContain('OpenShell Local is experimental');
    expect(health.message).toContain('Sandbox sero-ws-1 is available');
  });

  it('reports sandbox list failures through health diagnostics', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'sandbox API unavailable', exitCode: 1 });
    const adapter = createAdapter();

    const health = await adapter.health();

    expect(health.providerId).toBe('openshell-local');
    expect(health.status).toBe('unavailable');
    expect(health.message).toContain('Sandbox sero-ws-1 could not be checked');
    expect(health.message).toContain('sandbox API unavailable');
  });

  it('does not execute when cwd is outside the workspace', async () => {
    const adapter = createAdapter();

    const result = await adapter.exec('npm test', { cwd: '/tmp/other' });

    expect(result).toEqual({
      stdout: '',
      stderr: 'Cannot run command outside workspace root in OpenShell Local mode: /tmp/other',
      exitCode: 1,
    });
    expect(mocks.checkOpenShellPrerequisites).not.toHaveBeenCalled();
    expect(mocks.runOpenShell).not.toHaveBeenCalled();
  });

  it('ensures gateway and sandbox, syncs, executes, and pulls in order', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'created', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'test output', stderr: '', exitCode: 0 });
    const workspaceManager = createWorkspaceManager();
    const adapter = createAdapter({ workspaceManager });

    const result = await adapter.exec('npm test', { cwd: '/tmp/ws/src', timeoutMs: 2_500 });

    expect(result).toEqual({ stdout: 'test output', stderr: '', exitCode: 0 });
    expect(mocks.checkOpenShellPrerequisites).toHaveBeenCalledTimes(1);
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(1, [
      'gateway', 'start', '--name', 'sero-local',
    ], { timeoutMs: 120_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(2, [
      'gateway', 'select', 'sero-local',
    ], { timeoutMs: 10_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(3, [
      '--gateway', 'sero-local',
      'sandbox', 'list', '--names', '--selector', 'sero.workspaceId=ws-1',
    ], { timeoutMs: 30_000 });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-local',
      'sandbox', 'create', '--name', 'sero-ws-1',
      '--label', 'sero.workspaceId=ws-1',
    ], { timeoutMs: 120_000 });
    expect(mocks.pushWorkspaceToSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      workspacePath: '/tmp/ws',
      runtimeWorkspacePath: '/workspace/ws',
      timeoutMs: 2_500,
    });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(5, [
      '--gateway', 'sero-local',
      'sandbox', 'exec', '-n', 'sero-ws-1',
      '--workdir', '/workspace/ws/src',
      '--timeout', '3',
      '--no-tty', '--', 'sh', '-lc', 'npm test',
    ], { timeoutMs: 2_500 });
    expect(mocks.pullWorkspaceFromSandbox).toHaveBeenCalledWith({
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      workspacePath: '/tmp/ws',
      runtimeWorkspacePath: '/workspace/ws',
      timeoutMs: 2_500,
    });
    expect(workspaceManager.setRuntimeConfig).toHaveBeenCalledWith('ws-1', {
      providerId: 'openshell-local',
      experimental: true,
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
      runtimeWorkspacePath: '/workspace/ws',
    });
  });

  it('uses configured gateway and sandbox names without recreating an existing sandbox', async () => {
    const runtimeConfig: WorkspaceRuntimeConfig = {
      providerId: 'openshell-local',
      gatewayName: 'custom-local',
      sandboxName: 'custom-sandbox',
      runtimeWorkspacePath: '/workspace/custom',
      experimental: true,
    };
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'custom-sandbox\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'ok', stderr: '', exitCode: 0 });
    const adapter = createAdapter({ workspaceManager: createWorkspaceManager(runtimeConfig) });

    const result = await adapter.exec('pwd', { cwd: '/tmp/ws' });

    expect(result.exitCode).toBe(0);
    expect(mocks.runOpenShell).toHaveBeenCalledTimes(4);
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'custom-local',
      'sandbox', 'exec', '-n', 'custom-sandbox',
      '--workdir', '/workspace/ws',
      '--timeout', '120',
      '--no-tty', '--', 'sh', '-lc', 'pwd',
    ], { timeoutMs: undefined });
  });

  it('returns a clear failure without host fallback when OpenShell ensure fails', async () => {
    mocks.runOpenShell.mockResolvedValueOnce({
      stdout: '',
      stderr: 'gateway failed',
      exitCode: 7,
    });
    const adapter = createAdapter();

    const result = await adapter.exec('npm test', { cwd: '/tmp/ws' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Gateway sero-local is unavailable');
    expect(result.stderr).toContain('gateway failed');
    expect(mocks.pushWorkspaceToSandbox).not.toHaveBeenCalled();
  });

  it('returns OpenShell command failures after still pulling workspace changes', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'created', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: '', stderr: 'test failed', exitCode: 2 });
    const adapter = createAdapter();

    const result = await adapter.exec('npm test', { cwd: '/tmp/ws' });

    expect(result).toEqual({ stdout: '', stderr: 'test failed', exitCode: 2 });
    expect(mocks.pullWorkspaceFromSandbox).toHaveBeenCalledTimes(1);
  });

  it('ensures runtime and forwards ports through OpenShell', async () => {
    mocks.runOpenShell
      .mockResolvedValueOnce({ stdout: 'gateway started', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'selected', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'sero-ws-1\n', stderr: '', exitCode: 0 })
      .mockResolvedValueOnce({ stdout: 'forwarded http://127.0.0.1:5173', stderr: '', exitCode: 0 });
    const adapter = createAdapter();

    const forwarded = await adapter.forwardPort?.(5173);

    expect(forwarded).toEqual({
      runtimePort: 5173,
      localPort: 5173,
      localUrl: 'http://127.0.0.1:5173',
      status: 'ready',
    });
    expect(mocks.runOpenShell).toHaveBeenNthCalledWith(4, [
      '--gateway', 'sero-local',
      'forward', 'start', '5173', 'sero-ws-1', '-d',
    ], { timeoutMs: 30_000 });
  });

  it('returns a host terminal with an explicit OpenShell fallback reason', async () => {
    const pty = { pid: 123 };
    const terminals = createTerminals(pty);
    const adapter = createAdapter({ terminals });

    const session = await adapter.createTerminal({ terminalId: 'term-1', cols: 100, rows: 40 });

    expect(terminals.createHostTerminal).toHaveBeenCalledWith('ws-1', 'term-1', '/tmp/ws', 100, 40);
    expect(session).toEqual({
      pty,
      runtime: 'host',
      fallbackReason: 'OpenShell Local does not support interactive PTY terminals yet; using a host terminal for UI compatibility.',
    });
    expect(OPENSHELL_LOCAL_CAPABILITIES.interactiveTerminal).toBe(false);
  });

  it('sanitizes deterministic sandbox names from workspace IDs', () => {
    expect(getDefaultOpenShellSandboxName('My Workspace!/../id')).toBe('sero-My-Workspace-..-id');
  });
});

function createAdapter(overrides: {
  terminals?: TerminalManager;
  workspaceManager?: ReturnType<typeof createWorkspaceManager>;
} = {}) {
  return createOpenShellLocalRuntimeAdapter({
    workspaceId: 'ws-1',
    workspacePath: '/tmp/ws',
    terminals: overrides.terminals ?? createTerminals({ pid: 1 }),
    workspaceManager: overrides.workspaceManager ?? createWorkspaceManager(),
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
