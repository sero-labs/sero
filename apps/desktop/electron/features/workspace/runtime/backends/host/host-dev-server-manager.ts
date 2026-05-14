import type {
  RuntimeDevServer,
  RuntimeDevServerChangeEvent,
  RuntimeDevServerRegisterInput,
  RuntimeDevServerRestartInput,
  RuntimeDevServerStartInput,
  RuntimeDevServerStatus,
  RuntimeDevServerStatusInput,
  RuntimeDevServerStopInput,
  RuntimeExecFileInput,
  RuntimeExecResult,
  RuntimePreviewUrl,
  RuntimePreviewUrlInput,
  RuntimeProcess,
  RuntimeProcessInput,
} from '../../types';

export type HostDevServerDiagnosticCode = 'dev-server-port-detect-timeout';

interface RuntimeProcessExit {
  exitCode: number | null;
  signal?: string;
}

type ExecFile = (input: RuntimeExecFileInput) => Promise<RuntimeExecResult>;
type SpawnProcess = (input: RuntimeProcessInput) => Promise<RuntimeProcess>;

export interface HostDevServerManagerOptions {
  workspaceId: string;
  platform: NodeJS.Platform;
  spawn: SpawnProcess;
  execFile: ExecFile;
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
  private readonly execFile: ExecFile;
  private readonly pollIntervalMs: number;
  private readonly portDetectTimeoutMs: number;
  private readonly terminateGraceMs: number;
  private readonly changeCallbacks = new Set<(event: RuntimeDevServerChangeEvent) => void>();

  constructor(options: HostDevServerManagerOptions) {
    this.workspaceId = options.workspaceId;
    this.spawn = options.spawn;
    this.execFile = options.execFile;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.portDetectTimeoutMs = options.portDetectTimeoutMs ?? 10_000;
    this.terminateGraceMs = options.terminateGraceMs ?? 750;
  }

  async start(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    const cwd = input.cwd || '/workspace';
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
      cwd: input.cwd || '/workspace',
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
    await this.removeServer(input.serverId, { forceKillListener: false });
  }

  async restart(input: RuntimeDevServerRestartInput): Promise<RuntimeDevServer> {
    const server = this.servers.get(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    // Restart is an explicit reboot — terminate any listener even for registered records
    // so the new spawn can bind the port without conflicting with the previous owner.
    await this.removeServer(input.serverId, { forceKillListener: true });
    return this.start({
      command: server.command,
      cwd: server.cwd,
      name: server.name,
      framework: server.framework,
      scope: server.scope,
      cardId: server.cardId,
    });
  }

  private async removeServer(serverId: string, options: { forceKillListener: boolean }): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) throw new Error(`Dev server not found: ${serverId}`);
    server.onExitUnsubscribe?.();
    await this.terminateServer(server, options);
    server.status = 'stopped';
    this.emitDevServerChange({
      type: 'status_changed',
      workspaceId: this.workspaceId,
      serverId: server.id,
      status: 'stopped',
    });
    this.servers.delete(serverId);
    this.emitDevServerChange({
      type: 'unregistered',
      workspaceId: this.workspaceId,
      serverId: server.id,
      status: 'stopped',
    });
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
      const pids = [rootPid, ...await this.descendantPids(rootPid)];
      const port = await this.listeningPort(pids);
      if (port) return port;
      await sleep(this.pollIntervalMs);
    }
    return null;
  }

  private async descendantPids(rootPid: number): Promise<number[]> {
    const seen = new Set<number>();
    const queue = [rootPid];
    while (queue.length > 0) {
      const parent = queue.shift();
      if (!parent) continue;
      const result = await this.execFile({ program: 'pgrep', args: ['-P', String(parent)], timeoutMs: 2_000 });
      if (result.exitCode !== 0) continue;
      for (const line of result.stdout.split('\n')) {
        const pid = Number(line.trim());
        if (!Number.isInteger(pid) || seen.has(pid)) continue;
        seen.add(pid);
        queue.push(pid);
      }
    }
    return [...seen];
  }

  private async listeningPort(pids: number[]): Promise<number | null> {
    const lsof = await this.execFile({
      program: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')],
      timeoutMs: 2_000,
    }).catch(() => null);
    const lsofPort = lsof?.exitCode === 0 ? parseLsofPort(lsof.stdout) : null;
    if (lsofPort) return lsofPort;

    const ss = await this.execFile({ program: 'ss', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    const ssPort = ss?.exitCode === 0 ? parseSocketTablePort(ss.stdout, pids) : null;
    if (ssPort) return ssPort;

    const netstat = await this.execFile({ program: 'netstat', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    return netstat?.exitCode === 0 ? parseSocketTablePort(netstat.stdout, pids) : null;
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
    const descendants = (await Promise.all(roots.map((pid) => this.descendantPids(pid)))).flat();
    const listeners = port ? await this.listenerPids(port) : [];
    const pids = uniqueNumbers([...roots, ...descendants, ...listeners]);
    if (pids.length > 0) await this.killPids('-TERM', pids);
    if (port) {
      await sleep(this.terminateGraceMs);
      const remainingListeners = await this.listenerPids(port);
      if (remainingListeners.length > 0) await this.killPids('-KILL', remainingListeners);
    }
  }

  private async listenerPids(port: number): Promise<number[]> {
    const result = await this.execFile({
      program: 'lsof',
      args: ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
      timeoutMs: 2_000,
    }).catch(() => null);
    if (result?.exitCode === 0) return parsePidLines(result.stdout);

    const ss = await this.execFile({ program: 'ss', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    if (ss?.exitCode === 0) return parseSocketTablePids(ss.stdout, port);

    const netstat = await this.execFile({ program: 'netstat', args: ['-tlnp'], timeoutMs: 2_000 }).catch(() => null);
    return netstat?.exitCode === 0 ? parseSocketTablePids(netstat.stdout, port) : [];
  }

  private async killPids(signal: '-TERM' | '-KILL', pids: number[]): Promise<void> {
    if (pids.length === 0) return;
    await this.execFile({
      program: 'kill',
      args: [signal, ...pids.map(String)],
      timeoutMs: 2_000,
    }).catch(() => undefined);
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

export function parseLsofPort(output: string): number | null {
  for (const line of output.split('\n')) {
    const match = line.match(/TCP\s+\S+:(\d+)\s+\(LISTEN\)/);
    if (!match) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0) return port;
  }
  return null;
}

function parsePidLines(output: string): number[] {
  return output.split('\n')
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function parseSocketTablePort(output: string, pids: number[]): number | null {
  const pidSet = new Set(pids);
  for (const line of output.split('\n')) {
    if (!line.includes('LISTEN')) continue;
    if (!parseSocketLinePids(line).some((pid) => pidSet.has(pid))) continue;
    const port = parseSocketLinePort(line);
    if (port) return port;
  }
  return null;
}

function parseSocketTablePids(output: string, port: number): number[] {
  const pids: number[] = [];
  for (const line of output.split('\n')) {
    if (!line.includes('LISTEN') || parseSocketLinePort(line) !== port) continue;
    pids.push(...parseSocketLinePids(line));
  }
  return uniqueNumbers(pids);
}

function parseSocketLinePort(line: string): number | null {
  const addresses = line.matchAll(/(?:^|\s)\S+:(\d{1,5})(?=\s|$)/g);
  for (const match of addresses) {
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  }
  return null;
}

function parseSocketLinePids(line: string): number[] {
  const pids = [...line.matchAll(/pid=(\d+)/g), ...line.matchAll(/\b(\d+)\//g)]
    .map((match) => Number(match[1]));
  return uniqueNumbers(pids);
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
