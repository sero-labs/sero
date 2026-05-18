import { describe, expect, it, vi } from 'vitest';

import { HostDevServerManager } from '@electron/features/workspace/runtime/backends/host/host-dev-server-manager';
import type { HostProcessAdapter } from '@electron/features/workspace/runtime/backends/host/process/types';
import type { RuntimeProcessInput } from '@electron/features/workspace/runtime/types';

function createProcess(pid = 1234, executionPid?: number) {
  return {
    pid,
    executionPid,
    write: vi.fn(),
    signal: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn(() => vi.fn()),
  };
}

function createProcessAdapter(overrides: Partial<HostProcessAdapter> = {}): HostProcessAdapter {
  return {
    descendantPids: vi.fn(async () => []),
    listeningPort: vi.fn(async () => 5173),
    listenerPids: vi.fn(async () => []),
    killPids: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createManager(options: {
  processAdapter?: HostProcessAdapter;
  spawn?: (input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>;
  portDetectTimeoutMs?: number;
} = {}): HostDevServerManager {
  return new HostDevServerManager({
    workspaceId: 'workspace-a',
    spawn: options.spawn ?? vi.fn(async () => createProcess()),
    processAdapter: options.processAdapter ?? createProcessAdapter(),
    pollIntervalMs: 1,
    portDetectTimeoutMs: options.portDetectTimeoutMs ?? 10,
  });
}

describe('HostDevServerManager', () => {
  it('keeps stopped host dev servers registered so they can be restarted', async () => {
    const process = createProcess();
    const manager = createManager({ spawn: vi.fn(async () => process) });
    const events: unknown[] = [];
    manager.onChange((event) => events.push(event));

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.stop({ serverId: server.id });

    expect(events).toEqual([
      expect.objectContaining({
        type: 'registered',
        workspaceId: 'workspace-a',
        serverId: server.id,
        status: 'running',
      }),
      expect.objectContaining({
        type: 'status_changed',
        workspaceId: 'workspace-a',
        serverId: server.id,
        status: 'stopped',
      }),
    ]);
  });

  it('starts a host dev server with detected localhost URL', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess());
    const processAdapter = createProcessAdapter();
    const manager = createManager({ spawn, processAdapter });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(spawn).toHaveBeenCalledWith({ command: 'pnpm dev', cwd: '/workspace', stdio: 'pipe' });
    expect(processAdapter.descendantPids).toHaveBeenCalledWith(1234);
    expect(processAdapter.listeningPort).toHaveBeenCalledWith([1234]);
    expect(server).toMatchObject({
      id: 'workspace-a:workspace:root:5173',
      port: 5173,
      url: 'http://127.0.0.1:5173',
      status: 'running',
    });
    expect(manager.list()).toEqual([server]);
  });

  it('uses executionPid for port detection when available', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess(111, 222));
    const processAdapter = createProcessAdapter();
    const manager = createManager({ spawn, processAdapter });

    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(processAdapter.descendantPids).toHaveBeenCalledWith(222);
    expect(processAdapter.listeningPort).toHaveBeenCalledWith([222]);
  });

  it('uses process adapter methods instead of direct Unix process commands', async () => {
    const forbiddenExecFile = vi.fn(async (input: { program: string }) => {
      if (['pgrep', 'lsof', 'ss', 'netstat', 'kill'].includes(input.program)) {
        throw new Error(`forbidden direct command: ${input.program}`);
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    const processAdapter = createProcessAdapter({
      descendantPids: vi.fn(async () => [2000]),
      listeningPort: vi.fn(async () => 5173),
      listenerPids: vi.fn(async () => [3000]),
      killPids: vi.fn(async () => undefined),
    });
    const process = createProcess(1234);
    const manager = createManager({ spawn: vi.fn(async () => process), processAdapter });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.stop({ serverId: server.id });

    expect(forbiddenExecFile).not.toHaveBeenCalled();
    expect(processAdapter.descendantPids).toHaveBeenCalledWith(1234);
    expect(processAdapter.listenerPids).toHaveBeenCalledWith(5173);
    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [1234, 2000, 3000]);
    expect(processAdapter.killPids).toHaveBeenCalledWith('KILL', [3000]);
  });

  it('kills descendants and listener PIDs when stopping a host dev server', async () => {
    const process = createProcess(1234);
    const processAdapter = createProcessAdapter({
      descendantPids: vi.fn(async () => [2000]),
      listenerPids: vi.fn(async () => [3000]),
    });
    const manager = createManager({ spawn: vi.fn(async () => process), processAdapter });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.stop({ serverId: server.id });

    expect(process.signal).toHaveBeenCalledWith('SIGTERM');
    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [1234, 2000, 3000]);
    expect(processAdapter.killPids).toHaveBeenCalledWith('KILL', [3000]);
  });

  it('preserves dev-server metadata on restart', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess());
    const processAdapter = createProcessAdapter();
    const manager = createManager({ spawn, processAdapter });

    const server = await manager.start({
      command: 'pnpm dev',
      cwd: '/workspace/app',
      name: 'Card Preview',
      framework: 'vite',
      scope: 'card-preview',
      cardId: 'card-1',
    });
    const restarted = await manager.restart({ serverId: server.id });

    expect(spawn).toHaveBeenNthCalledWith(2, { command: 'pnpm dev', cwd: '/workspace/app', stdio: 'pipe' });
    expect(restarted).toMatchObject({
      id: 'workspace-a:card-preview:card-1:5173',
      name: 'Card Preview',
      framework: 'vite',
      scope: 'card-preview',
      cardId: 'card-1',
    });
  });

  it('stops a registered dev server without killing the foreign listener process', async () => {
    const processAdapter = createProcessAdapter();
    const manager = createManager({ spawn: vi.fn(), processAdapter });

    const server = manager.register({ command: 'externally managed', cwd: '/workspace', port: 4321 });
    await manager.stop({ serverId: server.id });

    expect(processAdapter.listenerPids).not.toHaveBeenCalled();
    expect(processAdapter.killPids).not.toHaveBeenCalled();
    expect(manager.list()).toEqual([expect.objectContaining({ id: server.id, status: 'stopped' })]);
  });

  it('restart of a registered dev server force-kills the existing listener before respawning', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess());
    const processAdapter = createProcessAdapter({
      listeningPort: vi.fn(async () => 4321),
      listenerPids: vi.fn(async () => [9000]),
    });
    const manager = createManager({ spawn, processAdapter });

    const server = manager.register({ command: 'pnpm dev', cwd: '/workspace', port: 4321 });
    await manager.restart({ serverId: server.id });

    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [9000]);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it('dispose leaves registered listeners alive', async () => {
    const processAdapter = createProcessAdapter();
    const manager = createManager({ spawn: vi.fn(), processAdapter });

    manager.register({ command: 'externally managed', cwd: '/workspace', port: 4321 });
    await manager.dispose();

    expect(processAdapter.listenerPids).not.toHaveBeenCalled();
    expect(processAdapter.killPids).not.toHaveBeenCalled();
    expect(manager.list()).toEqual([]);
  });

  it('throws and terminates the spawned process when port detection times out', async () => {
    const process = createProcess();
    const processAdapter = createProcessAdapter({ listeningPort: vi.fn(async () => null) });
    const manager = createManager({
      spawn: vi.fn(async () => process),
      processAdapter,
      portDetectTimeoutMs: 2,
    });

    await expect(manager.start({ command: 'pnpm dev', cwd: '/workspace' }))
      .rejects.toThrow('No listening port was detected after starting the command.');

    expect(process.signal).toHaveBeenCalledTimes(1);
    expect(process.signal).toHaveBeenCalledWith('SIGTERM');
    expect(manager.list()).toEqual([]);
  });
});
