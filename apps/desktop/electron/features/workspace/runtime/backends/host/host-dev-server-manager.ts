import type {
  RuntimeDevServer,
  RuntimeDevServerChangeEvent,
  RuntimeDevServerRegisterInput,
  RuntimeDevServerRestartInput,
  RuntimeDevServerStartInput,
  RuntimeDevServerStatus,
  RuntimeDevServerStatusInput,
  RuntimeDevServerStopInput,
  RuntimePreviewUrl,
  RuntimePreviewUrlInput,
  RuntimeProcess,
  RuntimeProcessInput,
} from '../../types';
import { RUNTIME_WORKSPACE_PATH } from '../../runtime-paths';
import type { HostProcessAdapter } from './process/types';

export type HostDevServerDiagnosticCode = 'dev-server-port-detect-timeout';

interface RuntimeProcessExit {
  exitCode: number | null;
  signal?: string;
}

type SpawnProcess = (input: RuntimeProcessInput) => Promise<RuntimeProcess>;

export interface HostDevServerManagerOptions {
  workspaceId: string;
  defaultCwd?: string;
  spawn: SpawnProcess;
  processAdapter: HostProcessAdapter;
  pollIntervalMs?: number;
  portDetectTimeoutMs?: number;
  terminateGraceMs?: number;
}

interface HostDevServerRecord extends RuntimeDevServer {
  status: 'starting' | 'running' | 'failed' | 'stopped';
  pid?: number;
  executionPid?: number;
  process?: RuntimeProcess;
  onExitUnsubscribe?: () => void;
  diagnosticCode?: HostDevServerDiagnosticCode;
  /**
   * Tracks how this record entered the manager:
   *   - `spawned`: Sero started the command, so we own the process tree and
   *     may aggressively SIGTERM/SIGKILL it on stop.
   *   - `registered`: an external process is serving the port and the user
   *     told Sero about it. Stopping only removes Sero's bookkeeping; killing
   *     the listener would terminate user-owned tools.
   */
  origin: 'spawned' | 'registered';
}

export class HostDevServerManager {
  private readonly servers = new Map<string, HostDevServerRecord>();
  private readonly workspaceId: string;
  private readonly spawn: SpawnProcess;
  private readonly processAdapter: HostProcessAdapter;
  private readonly defaultCwd: string;
  private readonly pollIntervalMs: number;
  private readonly portDetectTimeoutMs: number;
  private readonly terminateGraceMs: number;
  private readonly changeCallbacks = new Set<(event: RuntimeDevServerChangeEvent) => void>();

  constructor(options: HostDevServerManagerOptions) {
    this.workspaceId = options.workspaceId;
    this.spawn = options.spawn;
    this.processAdapter = options.processAdapter;
    this.defaultCwd = options.defaultCwd ?? RUNTIME_WORKSPACE_PATH;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.portDetectTimeoutMs = options.portDetectTimeoutMs ?? 10_000;
    this.terminateGraceMs = options.terminateGraceMs ?? 750;
  }

  async start(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    const cwd = input.cwd || this.defaultCwd;
    const process = await this.spawn({ command: input.command, cwd, stdio: 'pipe' });
    const pid = process.pid;
    const detectionPid = process.executionPid ?? process.pid;
    const baseId = `${this.workspaceId}:${input.scope ?? 'workspace'}:${input.cardId ?? 'root'}`;

    let terminated = false;
    let earlyExit: RuntimeProcessExit | undefined;
    let recordId: string | undefined;
    const unsubscribeExit = process.onExit((exit) => {
      earlyExit = exit;
      if (recordId) this.markSpawnedServerFailed(recordId, exit);
    });
    try {
      const port = detectionPid ? await this.detectListeningPort(detectionPid, () => earlyExit === undefined) : null;
      if (!port) {
        await this.terminateProcess(process, detectionPid);
        terminated = true;
        throw new Error(earlyExit
          ? `Dev server exited before a listening port was detected${formatProcessExit(earlyExit)}.`
          : 'No listening port was detected after starting the command.');
      }
      const url = `http://127.0.0.1:${port}`;
      recordId = `${baseId}:${port}`;
      const record: HostDevServerRecord = {
        id: recordId,
        port,
        url,
        command: input.command,
        cwd,
        name: input.name,
        framework: input.framework,
        scope: input.scope ?? 'workspace',
        cardId: input.cardId,
        registeredAt: new Date().toISOString(),
        status: 'running',
        pid,
        executionPid: detectionPid,
        process,
        onExitUnsubscribe: unsubscribeExit,
        origin: 'spawned',
      };
      this.servers.set(record.id, record);
      this.emitDevServerChange({
        type: 'registered',
        workspaceId: this.workspaceId,
        serverId: record.id,
        server: { ...toRuntimeServer(record), workspaceId: this.workspaceId },
        status: 'running',
      });
      return toRuntimeServer(record);
    } catch (err) {
      unsubscribeExit();
      if (!terminated) await this.terminateProcess(process, detectionPid);
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  register(input: RuntimeDevServerRegisterInput): RuntimeDevServer {
    const scope = input.scope ?? 'workspace';
    const record: HostDevServerRecord = {
      id: `${this.workspaceId}:${scope}:${input.cardId ?? 'root'}:${input.port}`,
      port: input.port,
      url: `http://127.0.0.1:${input.port}`,
      command: input.command,
      cwd: input.cwd || this.defaultCwd,
      name: input.name,
      framework: input.framework,
      scope,
      cardId: input.cardId,
      registeredAt: new Date().toISOString(),
      status: 'running',
      origin: 'registered',
    };
    this.servers.set(record.id, record);
    this.emitDevServerChange({
      type: 'registered',
      workspaceId: this.workspaceId,
      serverId: record.id,
      server: { ...toRuntimeServer(record), workspaceId: this.workspaceId },
      status: 'running',
    });
    return toRuntimeServer(record);
  }

  async stop(input: RuntimeDevServerStopInput): Promise<void> {
    const server = this.servers.get(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    if (server.status !== 'stopped') {
      server.onExitUnsubscribe?.();
      await this.terminateServer(server, { forceKillListener: false });
    }
    server.status = 'stopped';
    this.emitDevServerChange({
      type: 'status_changed',
      workspaceId: this.workspaceId,
      serverId: server.id,
      status: 'stopped',
    });
  }

  unregister(input: RuntimeDevServerStopInput): void {
    const server = this.servers.get(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    server.onExitUnsubscribe?.();
    this.servers.delete(input.serverId);
    this.emitDevServerChange({
      type: 'unregistered',
      workspaceId: this.workspaceId,
      serverId: server.id,
      status: 'stopped',
    });
  }

  async restart(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> {
    const server = this.servers.get(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    // Restart is an explicit reboot — terminate any listener even for registered records
    // so the new spawn can bind the port without conflicting with the previous owner.
    if (server.status !== 'stopped') {
      server.onExitUnsubscribe?.();
      await this.terminateServer(server, { forceKillListener: true });
      server.status = 'stopped';
      this.emitDevServerChange({
        type: 'status_changed',
        workspaceId: this.workspaceId,
        serverId: server.id,
        status: 'stopped',
      });
    }
    const restarted = await this.start({
      command: server.command,
      cwd: server.cwd,
      name: server.name,
      framework: server.framework,
      scope: server.scope,
      cardId: server.cardId,
    });
    if (restarted.id !== input.serverId && this.servers.has(input.serverId)) this.unregister(input);
    return restarted;
  }

  status(input: RuntimeDevServerStatusInput): RuntimeDevServerStatus {
    const records = input.serverId ? [this.servers.get(input.serverId)].filter(isRecord) : [...this.servers.values()];
    return { servers: records.map(toRuntimeServer) };
  }

  list(): RuntimeDevServer[] {
    return [...this.servers.values()].map(toRuntimeServer);
  }

  onChange(cb: (event: RuntimeDevServerChangeEvent) => void): () => void {
    this.changeCallbacks.add(cb);
    return () => this.changeCallbacks.delete(cb);
  }

  async dispose(): Promise<void> {
    const servers = [...this.servers.values()];
    // On dispose Sero only tears down its own spawned processes — registered (foreign)
    // listeners belong to the user and must outlive the workspace runtime.
    for (const server of servers) server.onExitUnsubscribe?.();
    await Promise.all(servers.map((server) => this.terminateServer(server, { forceKillListener: false })));
    for (const server of servers) {
      server.status = 'stopped';
      this.emitDevServerChange({
        type: 'unregistered',
        workspaceId: this.workspaceId,
        serverId: server.id,
        status: 'stopped',
      });
    }
    this.servers.clear();
  }

  async resolvePreviewUrl(input: RuntimePreviewUrlInput): Promise<RuntimePreviewUrl> {
    const url = `http://127.0.0.1:${input.targetPort}${input.path ?? ''}`;
    return { url, targetPort: input.targetPort, backend: 'host' };
  }

  private async detectListeningPort(rootPid: number, shouldContinue: () => boolean = () => true): Promise<number | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.portDetectTimeoutMs && shouldContinue()) {
      const pids = [rootPid, ...await this.processAdapter.descendantPids(rootPid)];
      const port = await this.processAdapter.listeningPort(pids);
      if (port) return port;
      await sleep(this.pollIntervalMs);
    }
    return null;
  }

  private async terminateServer(
    server: HostDevServerRecord,
    options: { forceKillListener: boolean },
  ): Promise<void> {
    if (server.origin === 'registered' && !options.forceKillListener) {
      // Registered servers are owned by an external process; we only drop the record.
      return;
    }
    await this.terminateProcess(server.process, server.executionPid ?? server.pid, server.port);
  }

  private async terminateProcess(process: RuntimeProcess | undefined, rootPid?: number, port?: number): Promise<void> {
    process?.signal('SIGTERM');
    const roots = rootPid ? [rootPid] : [];
    const descendants = (await Promise.all(roots.map((pid) => this.processAdapter.descendantPids(pid)))).flat();
    const listeners = port ? await this.processAdapter.listenerPids(port) : [];
    const pids = uniqueNumbers([...roots, ...descendants, ...listeners]);
    if (pids.length > 0) await this.processAdapter.killPids('TERM', pids);
    if (port) {
      await sleep(this.terminateGraceMs);
      const remainingListeners = await this.processAdapter.listenerPids(port);
      if (remainingListeners.length > 0) await this.processAdapter.killPids('KILL', remainingListeners);
    }
  }

  private markSpawnedServerFailed(serverId: string, exit: RuntimeProcessExit): void {
    const server = this.servers.get(serverId);
    if (!server || server.status === 'stopped' || server.status === 'failed') return;
    server.status = 'failed';
    this.emitDevServerChange({
      type: 'status_changed',
      workspaceId: this.workspaceId,
      serverId,
      status: 'failed',
    });
    console.warn(`[host-dev-server] ${serverId} exited${formatProcessExit(exit)}.`);
  }

  private emitDevServerChange(event: RuntimeDevServerChangeEvent): void {
    for (const cb of this.changeCallbacks) cb(event);
  }

}

function formatProcessExit(exit: RuntimeProcessExit): string {
  if (exit.signal) return ` with signal ${exit.signal}`;
  return typeof exit.exitCode === 'number' ? ` with exit code ${exit.exitCode}` : '';
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

function toRuntimeServer(record: HostDevServerRecord): RuntimeDevServer {
  return {
    id: record.id,
    port: record.port,
    url: record.url,
    command: record.command,
    cwd: record.cwd,
    name: record.name,
    framework: record.framework,
    scope: record.scope,
    cardId: record.cardId,
    registeredAt: record.registeredAt,
    status: record.status,
    pid: record.pid,
    diagnosticCode: record.diagnosticCode,
  };
}

function isRecord(record: HostDevServerRecord | undefined): record is HostDevServerRecord {
  return Boolean(record);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
