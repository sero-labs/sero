import { mkdtemp, readdir, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HostDevServerManager } from '@electron/features/workspace/runtime/backends/host/host-dev-server-manager';
import { HostDevServerRecovery } from '@electron/features/workspace/runtime/backends/host/host-dev-server-recovery';
import type { HostProcessAdapter } from '@electron/features/workspace/runtime/backends/host/process/types';
import type { RuntimeProcessInput, RuntimeProcess } from '@electron/features/workspace/runtime/types';

// The recovery code asks the operating system whether a pid is alive, and it keeps a record
// while one is. A made-up pid like 1234 can belong to a real process on a busy CI runner, so
// these are above any pid an operating system hands out.
const SHELL_PID = 999_000_001;
const SERVER_PID = 999_000_002;
const FOREIGN_PID = 999_000_003;
const NEXT_SERVER_PID = 999_000_004;

function createProcess(pid = SHELL_PID, executionPid?: number) {
  return {
    pid,
    executionPid,
    write: vi.fn(),
    signal: vi.fn(),
    onData: vi.fn(() => vi.fn()),
    onExit: vi.fn((_listener: Parameters<RuntimeProcess['onExit']>[0]) => vi.fn()),
  };
}

function createProcessAdapter(overrides: Partial<HostProcessAdapter> = {}): HostProcessAdapter {
  return {
    descendantPids: vi.fn(async () => []),
    listeningPort: vi.fn(async () => 5173),
    listenerPids: vi.fn(async () => []),
    killPids: vi.fn(async () => undefined),
    processIdentity: vi.fn(async (pid) => `start:${pid}`),
    ...overrides,
  };
}

function createManager(options: {
  processAdapter?: HostProcessAdapter;
  spawn?: (input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>;
  portDetectTimeoutMs?: number;
  recovery?: HostDevServerRecovery;
} = {}): HostDevServerManager {
  return new HostDevServerManager({
    workspaceId: 'workspace-a',
    spawn: options.spawn ?? vi.fn(async () => createProcess()),
    processAdapter: options.processAdapter ?? createProcessAdapter(),
    recovery: options.recovery,
    pollIntervalMs: 1,
    portDetectTimeoutMs: options.portDetectTimeoutMs ?? 10,
    // The SIGTERM->SIGKILL grace defaults to 750ms of real waiting; the tests assert
    // that both kill rounds happen, not how long the manager waits between them.
    terminateGraceMs: 1,
  });
}

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createRecovery(adapter: HostProcessAdapter): Promise<HostDevServerRecovery> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sero-dev-servers-'));
  temporaryDirectories.push(directory);
  return new HostDevServerRecovery(adapter, directory);
}

describe('HostDevServerManager', () => {
  it('keeps a recovery record when process identity lookup fails for a live process', async () => {
    let lookupAvailable = true;
    const adapter = createProcessAdapter({
      processIdentity: vi.fn(async (pid) => lookupAvailable ? `start:${pid}` : null),
    });
    const recovery = await createRecovery(adapter);
    const id = await recovery.track([process.pid]);
    if (!id) throw new Error('Expected a recovery record for the live process.');

    lookupAvailable = false;
    await recovery.terminate(id);
    expect(await readdir(temporaryDirectories[0])).toHaveLength(1);
    expect(adapter.killPids).not.toHaveBeenCalled();
  });

  it('stops a child created after the initial snapshot when port detection times out', async () => {
    const identities = new Map([[process.pid, 'app-start'], [SHELL_PID, 'shell-start'], [SERVER_PID, 'late-server']]);
    let initialSnapshot = true;
    let parentExited = false;
    const adapter = createProcessAdapter({
      descendantPids: vi.fn(async (pid) => {
        if (pid !== SHELL_PID || parentExited) return [];
        if (initialSnapshot) {
          initialSnapshot = false;
          return [];
        }
        return [SERVER_PID];
      }),
      listeningPort: vi.fn(async () => null),
      processIdentity: vi.fn(async (pid) => identities.get(pid) ?? null),
      killPids: vi.fn(async (_signal, pids) => {
        for (const pid of pids) identities.delete(pid);
        if (pids.includes(SHELL_PID)) parentExited = true;
      }),
    });
    const recovery = await createRecovery(adapter);
    const shell = createProcess();
    shell.signal.mockImplementation(() => {
      parentExited = true;
      identities.delete(SHELL_PID);
    });
    const manager = createManager({
      spawn: vi.fn(async () => shell), processAdapter: adapter, recovery, portDetectTimeoutMs: 5,
    });

    await expect(manager.start({ command: 'install && dev', cwd: '/workspace' }))
      .rejects.toThrow('No listening port was detected');
    expect(identities.has(SERVER_PID)).toBe(false);
    expect(await readdir(temporaryDirectories[0])).toEqual([]);
  });

  it('reports a quick process exit instead of a recovery identity error', async () => {
    const adapter = createProcessAdapter({
      processIdentity: vi.fn(async (pid) => pid === process.pid ? 'app-start' : null),
    });
    const recovery = await createRecovery(adapter);
    const quickExit = createProcess(999_999_999);
    quickExit.onExit.mockImplementation((listener) => {
      queueMicrotask(() => listener({ exitCode: 1 }));
      return vi.fn();
    });
    const manager = createManager({ processAdapter: adapter, recovery, spawn: vi.fn(async () => quickExit) });

    await expect(manager.start({ command: 'exit 1', cwd: '/workspace' }))
      .rejects.toThrow('Dev server exited before a listening port was detected with exit code 1.');
  });

  it('reaps a server after its owner is killed, but not a reused pid or a foreign listener', async () => {
    const identities = new Map([[process.pid, 'app-start'], [SHELL_PID, 'shell-start'], [SERVER_PID, 'vite-start'], [FOREIGN_PID, 'foreign-start']]);
    const adapter = createProcessAdapter({
      descendantPids: vi.fn(async (pid) => pid === SHELL_PID ? [SERVER_PID] : []),
      listenerPids: vi.fn(async () => [SERVER_PID, FOREIGN_PID]),
      processIdentity: vi.fn(async (pid) => identities.get(pid) ?? null),
      killPids: vi.fn(async (_signal, pids) => {
        for (const pid of pids) identities.delete(pid);
      }),
    });
    const recovery = await createRecovery(adapter);
    const manager = createManager({ processAdapter: adapter, recovery });
    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    await recovery.reapOrphans();
    expect(adapter.killPids).not.toHaveBeenCalled();

    identities.set(process.pid, 'new-app-start');
    identities.set(SHELL_PID, 'reused-shell-pid');
    await new HostDevServerRecovery(adapter, temporaryDirectories[0]).reapOrphans();
    expect(adapter.killPids).toHaveBeenCalledWith('TERM', [SERVER_PID]);
    expect(identities.has(FOREIGN_PID)).toBe(true);
    expect(identities.get(SHELL_PID)).toBe('reused-shell-pid');
    expect(await readdir(temporaryDirectories[0])).toEqual([]);
  });

  it('terminates an owned server before unregistering or replacing its record', async () => {
    const identities = new Map([[process.pid, 'app-start'], [SHELL_PID, 'server-start']]);
    const adapter = createProcessAdapter({
      processIdentity: vi.fn(async (pid) => identities.get(pid) ?? null),
      killPids: vi.fn(async (_signal, pids) => {
        for (const pid of pids) identities.delete(pid);
      }),
    });
    const recovery = await createRecovery(adapter);
    const manager = createManager({ processAdapter: adapter, recovery });
    const first = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(() => manager.register({ command: 'foreign', cwd: '/workspace', port: first.port })).toThrow('Cannot replace an owned dev server');
    await manager.unregister({ serverId: first.id });
    expect(adapter.killPids).toHaveBeenCalledWith('TERM', [SHELL_PID]);
    expect(manager.list()).toEqual([]);
    expect(await readdir(temporaryDirectories[0])).toEqual([]);
  });
  it.each(['stop', 'restart', 'dispose'] as const)('%s preserves unrelated listeners on the same port', async (action) => {
    let parentExited = false;
    const process = createProcess(SHELL_PID);
    process.signal.mockImplementation(() => { parentExited = true; });
    const processAdapter = createProcessAdapter({
      descendantPids: vi.fn(async () => parentExited ? [] : [SERVER_PID]),
      listenerPids: vi.fn(async () => [SERVER_PID, FOREIGN_PID]),
    });
    const manager = createManager({ spawn: vi.fn(async () => process), processAdapter });
    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    if (action === 'dispose') await manager.dispose();
    else await manager[action]({ serverId: server.id });

    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [SHELL_PID, SERVER_PID]);
    expect(processAdapter.killPids).toHaveBeenCalledWith('KILL', [SHELL_PID, SERVER_PID]);
    expect(processAdapter.listenerPids).not.toHaveBeenCalled();
  });

  it('terminates the old owner when a different command takes the same server ID', async () => {
    const identities = new Map([[process.pid, 'app-start'], [SHELL_PID, 'old-server'], [NEXT_SERVER_PID, 'new-server']]);
    const adapter = createProcessAdapter({
      processIdentity: vi.fn(async (pid) => identities.get(pid) ?? null),
      killPids: vi.fn(async (_signal, pids) => {
        for (const pid of pids) identities.delete(pid);
      }),
    });
    const recovery = await createRecovery(adapter);
    const spawn = vi.fn().mockResolvedValueOnce(createProcess(SHELL_PID)).mockResolvedValueOnce(createProcess(NEXT_SERVER_PID));
    const manager = createManager({ processAdapter: adapter, spawn, recovery });
    await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.start({ command: 'npm run dev', cwd: '/workspace' });

    expect(identities.has(SHELL_PID)).toBe(false);
    expect(manager.list()).toEqual([expect.objectContaining({ command: 'npm run dev', pid: NEXT_SERVER_PID })]);
    expect(await readdir(temporaryDirectories[0])).toHaveLength(1);
  });

  it('stops an orphaned listener before replacing a failed server record', async () => {
    const identities = new Map([[process.pid, 'app-start'], [SHELL_PID, 'old-shell'], [SERVER_PID, 'old-listener'], [NEXT_SERVER_PID, 'new-server']]);
    const adapter = createProcessAdapter({
      descendantPids: vi.fn(async (pid) => pid === SHELL_PID && identities.has(SHELL_PID) ? [SERVER_PID] : []),
      processIdentity: vi.fn(async (pid) => identities.get(pid) ?? null),
      killPids: vi.fn(async (_signal, pids) => {
        for (const pid of pids) identities.delete(pid);
      }),
    });
    const recovery = await createRecovery(adapter);
    const oldProcess = createProcess(SHELL_PID);
    const spawn = vi.fn().mockResolvedValueOnce(oldProcess).mockResolvedValueOnce(createProcess(NEXT_SERVER_PID));
    const manager = createManager({ processAdapter: adapter, spawn, recovery });
    const input = { command: 'pnpm dev', cwd: '/workspace' };
    await manager.start(input);
    identities.delete(SHELL_PID);
    oldProcess.onExit.mock.calls[0][0]({ exitCode: 1 });
    await manager.start(input);

    expect(identities.has(SERVER_PID)).toBe(false);
    expect(manager.list()).toEqual([expect.objectContaining({ pid: NEXT_SERVER_PID, status: 'running' })]);
  });

  it('shares concurrent preview starts and reuses the running server', async () => {
    const spawn = vi.fn(async () => createProcess());
    const manager = createManager({ spawn });
    const input = { command: 'pnpm dev', cwd: '/workspace' };
    const [first, second] = await Promise.all([manager.start(input), manager.start(input)]);
    expect(second.id).toBe(first.id);
    expect((await manager.start({ ...input, name: 'Evidence check' })).id).toBe(first.id);
    expect(spawn).toHaveBeenCalledOnce();
    await manager.stop({ serverId: first.id });
    await manager.start(input);
    expect(spawn).toHaveBeenCalledTimes(2);
    await manager.dispose();
  });

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

  it('starts a host dev server with detected 127.0.0.1 URL', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess());
    const processAdapter = createProcessAdapter();
    const manager = createManager({ spawn, processAdapter });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });

    expect(spawn).toHaveBeenCalledWith({ command: 'pnpm dev', cwd: '/workspace', stdio: 'pipe' });
    expect(processAdapter.descendantPids).toHaveBeenCalledWith(SHELL_PID);
    expect(processAdapter.listeningPort).toHaveBeenCalledWith([SHELL_PID]);
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

  it('uses the injected process adapter for process discovery and termination', async () => {
    const processAdapter = createProcessAdapter({
      descendantPids: vi.fn(async () => [SERVER_PID]),
      listeningPort: vi.fn(async () => 5173),
      listenerPids: vi.fn(async () => [3000]),
      killPids: vi.fn(async () => undefined),
    });
    const process = createProcess(SHELL_PID);
    const manager = createManager({ spawn: vi.fn(async () => process), processAdapter });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.stop({ serverId: server.id });

    expect(processAdapter.descendantPids).toHaveBeenCalledWith(SHELL_PID);
    expect(processAdapter.listeningPort).toHaveBeenCalledWith([SHELL_PID, SERVER_PID]);
    expect(processAdapter.listenerPids).not.toHaveBeenCalled();
    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [SHELL_PID, SERVER_PID]);
    expect(processAdapter.killPids).toHaveBeenCalledWith('KILL', [SHELL_PID, SERVER_PID]);
  });

  it('kills owned descendants when stopping a host dev server', async () => {
    const process = createProcess(SHELL_PID);
    const processAdapter = createProcessAdapter({
      descendantPids: vi.fn(async () => [SERVER_PID]),
      listenerPids: vi.fn(async () => [3000]),
    });
    const manager = createManager({ spawn: vi.fn(async () => process), processAdapter });

    const server = await manager.start({ command: 'pnpm dev', cwd: '/workspace' });
    await manager.stop({ serverId: server.id });

    expect(process.signal).toHaveBeenCalledWith('SIGTERM');
    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [SHELL_PID, SERVER_PID]);
    expect(processAdapter.killPids).toHaveBeenCalledWith('KILL', [SHELL_PID, SERVER_PID]);
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

    expect(server.url).toBe('http://127.0.0.1:4321');
    expect(processAdapter.listenerPids).not.toHaveBeenCalled();
    expect(processAdapter.killPids).not.toHaveBeenCalled();
    expect(manager.list()).toEqual([expect.objectContaining({ id: server.id, status: 'stopped' })]);
  });

  it('resolves host preview URLs through 127.0.0.1', async () => {
    const manager = createManager();

    await expect(manager.resolvePreviewUrl({ targetPort: 5173, path: '/dashboard' }))
      .resolves.toEqual({
        url: 'http://127.0.0.1:5173/dashboard',
        targetPort: 5173,
        backend: 'host',
      });
  });

  it('restart of a registered dev server force-kills the existing listener before respawning', async () => {
    const spawn = vi.fn<(input: RuntimeProcessInput) => Promise<ReturnType<typeof createProcess>>>()
      .mockResolvedValue(createProcess());
    const processAdapter = createProcessAdapter({
      listeningPort: vi.fn(async () => 4321),
      listenerPids: vi.fn(async () => [FOREIGN_PID]),
    });
    const manager = createManager({ spawn, processAdapter });

    const server = manager.register({ command: 'pnpm dev', cwd: '/workspace', port: 4321 });
    await manager.restart({ serverId: server.id });

    expect(processAdapter.killPids).toHaveBeenCalledWith('TERM', [FOREIGN_PID]);
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
    process.signal.mockImplementation(() => {
      process.onExit.mock.calls.at(-1)?.[0]({ exitCode: null, signal: 'SIGTERM' });
    });
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
