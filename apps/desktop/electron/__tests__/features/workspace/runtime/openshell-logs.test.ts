import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TerminalManager } from '@electron/features/container/terminal';
import type { WorkspaceRuntimeConfig } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  spawnOpenShell: vi.fn(),
  runOpenShell: vi.fn(),
  ipcMainHandle: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock('@electron/features/workspace/runtime/openshell/cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@electron/features/workspace/runtime/openshell/cli')>();
  return {
    ...actual,
    spawnOpenShell: mocks.spawnOpenShell,
    runOpenShell: mocks.runOpenShell,
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.ipcMainHandle },
  dialog: { showOpenDialog: vi.fn() },
  BrowserWindow: { getFocusedWindow: vi.fn() },
}));

vi.mock('@electron/shared/infra/shared-infra', () => ({
  appRuntimeManager: { reconcile: mocks.reconcile },
  containerManager: { terminals: createTerminals() },
}));

import { streamOpenShellLogs } from '@electron/features/workspace/runtime/openshell/logs';
import { createOpenShellLocalRuntimeAdapter } from '@electron/features/workspace/runtime/adapters/openshell-local-runtime-adapter';
import { destroyOpenShellSandboxBeforeRuntimeChange } from '@electron/ipc/workspace/workspace';

describe('OpenShell log streaming and destroy lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns openshell logs with gateway args and tails lines', () => {
    const child = createChildProcess();
    mocks.spawnOpenShell.mockReturnValue(child.process);
    const stream = streamOpenShellLogs({ gatewayName: 'sero-local', sandboxName: 'sero-ws' });
    const lines: string[] = [];
    const errors: string[] = [];
    const unsubscribeLine = stream.onLine((line) => lines.push(line));
    stream.onError((message) => errors.push(message));

    child.stdout.write('one\ntwo');
    child.stderr.write('warn\n');
    child.stdout.write(' continued\n');

    expect(mocks.spawnOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'logs', 'sero-ws', '--tail',
    ]);
    expect(lines).toEqual(['one', 'two continued']);
    expect(errors).toEqual(['warn']);

    unsubscribeLine();
    child.stdout.write('ignored\n');
    expect(lines).toEqual(['one', 'two continued']);
  });

  it('stops the child process and removes listeners', () => {
    const child = createChildProcess();
    mocks.spawnOpenShell.mockReturnValue(child.process);
    const stream = streamOpenShellLogs({ gatewayName: 'sero-local', sandboxName: 'sero-ws' });
    const lines: string[] = [];
    stream.onLine((line) => lines.push(line));

    child.stdout.write('partial');
    stream.stop();
    child.stdout.write('ignored\n');
    stream.stop();

    expect(lines).toEqual(['partial']);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.stdout.listenerCount('data')).toBe(0);
    expect(child.stderr.listenerCount('data')).toBe(0);
    expect(child.process.listenerCount('error')).toBe(0);
  });

  it('spawns remote OpenShell logs through the selected gateway without SSH', () => {
    const child = createChildProcess();
    mocks.spawnOpenShell.mockReturnValue(child.process);

    streamOpenShellLogs({ gatewayName: 'sero-remote-dev', sandboxName: 'sero-remote-ws' });

    expect(mocks.spawnOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-remote-dev',
      'logs', 'sero-remote-ws', '--tail',
    ]);
    expect(mocks.spawnOpenShell).not.toHaveBeenCalledWith(expect.arrayContaining(['ssh']));
  });

  it('spawns cloud OpenShell logs through the selected cloud gateway without host transport', () => {
    const child = createChildProcess();
    mocks.spawnOpenShell.mockReturnValue(child.process);

    streamOpenShellLogs({ gatewayName: 'sero-cloud-prod', sandboxName: 'sero-cloud-ws' });

    expect(mocks.spawnOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-cloud-prod',
      'logs', 'sero-cloud-ws', '--tail',
    ]);
    expect(flattenSpawnArgs()).not.toMatch(/ssh|docker|--remote/);
  });

  it('adapter destroy deletes the configured sandbox with gateway args', async () => {
    mocks.runOpenShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const adapter = createOpenShellLocalRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      workspaceManager: createWorkspaceManager({
        providerId: 'openshell-local',
        gatewayName: 'custom-gateway',
        sandboxName: 'custom-sandbox',
      }),
      terminals: createTerminals(),
    });

    await expect(adapter.destroy?.()).resolves.toBeUndefined();

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'custom-gateway',
      'sandbox', 'delete', 'custom-sandbox',
    ], { timeoutMs: 120_000 });
  });

  it('adapter destroy surfaces command output on delete failure', async () => {
    mocks.runOpenShell.mockResolvedValue({ stdout: 'out', stderr: 'denied', exitCode: 9 });
    const adapter = createOpenShellLocalRuntimeAdapter({
      workspaceId: 'ws-1',
      workspacePath: '/tmp/ws',
      workspaceManager: createWorkspaceManager({ providerId: 'openshell-local' }),
      terminals: createTerminals(),
    });

    await expect(adapter.destroy?.()).rejects.toThrow(/delete OpenShell sandbox failed/);
    await expect(adapter.destroy?.()).rejects.toThrow(/denied/);
  });

  it('destroys the old OpenShell sandbox before changing away from OpenShell', async () => {
    mocks.runOpenShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    const workspaceManager = createWorkspaceManager({
      providerId: 'openshell-local',
      gatewayName: 'sero-local',
      sandboxName: 'sero-ws-1',
    });

    await destroyOpenShellSandboxBeforeRuntimeChange('ws-1', { providerId: 'host' }, {
      workspaceManager,
      terminals: createTerminals(),
    });

    expect(mocks.runOpenShell).toHaveBeenCalledWith([
      '--gateway', 'sero-local',
      'sandbox', 'delete', 'sero-ws-1',
    ], { timeoutMs: 120_000 });
  });

  it('does not destroy when staying on OpenShell or when the current runtime is not OpenShell', async () => {
    const workspaceManager = createWorkspaceManager({ providerId: 'openshell-local' });

    await destroyOpenShellSandboxBeforeRuntimeChange('ws-1', { providerId: 'openshell-local' }, {
      workspaceManager,
      terminals: createTerminals(),
    });
    await destroyOpenShellSandboxBeforeRuntimeChange('ws-1', { providerId: 'host' }, {
      workspaceManager: createWorkspaceManager({ providerId: 'host' }),
      terminals: createTerminals(),
    });

    expect(mocks.runOpenShell).not.toHaveBeenCalled();
  });
});

function flattenSpawnArgs(): string {
  return mocks.spawnOpenShell.mock.calls
    .map((call) => (call[0] as string[]).join(' '))
    .join('\n');
}

function createChildProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const emitter = new EventEmitter();
  const kill = vi.fn(() => true);
  const process = Object.assign(emitter, {
    stdout,
    stderr,
    stdin: new PassThrough(),
    killed: false,
    kill,
  }) as unknown as ChildProcessWithoutNullStreams;
  return { process, stdout, stderr, kill };
}

function createWorkspaceManager(runtimeConfig: WorkspaceRuntimeConfig | undefined = undefined) {
  return {
    getRuntimeConfig: vi.fn(async () => runtimeConfig),
    setRuntimeConfig: vi.fn(async () => undefined),
    getPath: vi.fn(() => '/tmp/ws'),
  };
}

function createTerminals(): TerminalManager {
  return {
    createHostTerminal: vi.fn(),
  } as unknown as TerminalManager;
}
