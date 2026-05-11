import net from 'net';

import type {
  RuntimeDevServer,
  RuntimeDevServerChangeEvent,
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

export type HostDevServerDiagnosticCode = 'dev-server-port-detect-timeout' | 'wsl-localhost-forwarding-disabled';

type ExecFile = (input: RuntimeExecFileInput) => Promise<RuntimeExecResult>;
type SpawnProcess = (input: RuntimeProcessInput) => Promise<RuntimeProcess>;
type TcpProbe = (port: number) => Promise<boolean>;

export interface HostDevServerManagerOptions {
  workspaceId: string;
  platform: NodeJS.Platform;
  spawn: SpawnProcess;
  execFile: ExecFile;
  pollIntervalMs?: number;
  portDetectTimeoutMs?: number;
  tcpProbe?: TcpProbe;
  probeRetryDelayMs?: number;
}

interface HostDevServerRecord extends RuntimeDevServer {
  status: 'starting' | 'running' | 'failed' | 'stopped';
  pid?: number;
  process?: RuntimeProcess;
  diagnosticCode?: HostDevServerDiagnosticCode;
}

export class HostDevServerManager {
  private readonly servers = new Map<string, HostDevServerRecord>();
  private readonly workspaceId: string;
  private readonly platform: NodeJS.Platform;
  private readonly spawn: SpawnProcess;
  private readonly execFile: ExecFile;
  private readonly pollIntervalMs: number;
  private readonly portDetectTimeoutMs: number;
  private readonly tcpProbe: TcpProbe;
  private readonly probeRetryDelayMs: number;
  private readonly changeCallbacks = new Set<(event: RuntimeDevServerChangeEvent) => void>();

  constructor(options: HostDevServerManagerOptions) {
    this.workspaceId = options.workspaceId;
    this.platform = options.platform;
    this.spawn = options.spawn;
    this.execFile = options.execFile;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.portDetectTimeoutMs = options.portDetectTimeoutMs ?? 10_000;
    this.tcpProbe = options.tcpProbe ?? probeLocalhost;
    this.probeRetryDelayMs = options.probeRetryDelayMs ?? 500;
  }

  async start(input: RuntimeDevServerStartInput): Promise<RuntimeDevServer> {
    const cwd = input.cwd || '/workspace';
    const process = await this.spawn({ command: input.command, cwd, stdio: 'pipe' });
    const pid = process.pid;
    const detectionPid = process.executionPid ?? process.pid;
    const baseId = `${this.workspaceId}:${input.scope ?? 'workspace'}:${input.cardId ?? 'root'}`;

    let terminated = false;
    try {
      const port = detectionPid ? await this.detectListeningPort(detectionPid) : null;
      if (!port) {
        process.signal('SIGTERM');
        terminated = true;
        throw new Error('No listening port was detected after starting the command.');
      }
      const url = `http://127.0.0.1:${port}`;
      const record: HostDevServerRecord = {
        id: `${baseId}:${port}`,
        port,
        url,
        command: input.command,
        cwd,
        status: 'running',
        pid,
        process,
      };
      if (this.platform === 'win32' && !(await this.probeWindowsLocalhost(port))) {
        record.diagnosticCode = 'wsl-localhost-forwarding-disabled';
      }
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
      if (!terminated) process.signal('SIGTERM');
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  async stop(input: RuntimeDevServerStopInput): Promise<void> {
    const server = this.servers.get(input.serverId);
    if (!server) throw new Error(`Dev server not found: ${input.serverId}`);
    server.process?.signal('SIGTERM');
    server.status = 'stopped';
    this.emitDevServerChange({
      type: 'status_changed',
      workspaceId: this.workspaceId,
      serverId: server.id,
      status: 'stopped',
    });
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
    await this.stop(input);
    return this.start({ command: server.command, cwd: server.cwd });
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

  dispose(): void {
    for (const server of this.servers.values()) {
      server.process?.signal('SIGTERM');
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
    const server = [...this.servers.values()].find((candidate) => candidate.port === input.targetPort);
    const url = `http://127.0.0.1:${input.targetPort}${input.path ?? ''}`;
    if (server?.diagnosticCode === 'wsl-localhost-forwarding-disabled') {
      return { url, targetPort: input.targetPort, backend: 'host', diagnosticCode: server.diagnosticCode };
    }
    return { url, targetPort: input.targetPort, backend: 'host' };
  }

  private async detectListeningPort(rootPid: number): Promise<number | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.portDetectTimeoutMs) {
      const pids = [rootPid, ...await this.descendantPids(rootPid)];
      const port = await this.lsofPort(pids);
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

  private async lsofPort(pids: number[]): Promise<number | null> {
    const result = await this.execFile({
      program: 'lsof',
      args: ['-nP', '-iTCP', '-sTCP:LISTEN', '-p', pids.join(',')],
      timeoutMs: 2_000,
    });
    if (result.exitCode !== 0) return null;
    return parseLsofPort(result.stdout);
  }

  private async probeWindowsLocalhost(port: number): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (await this.tcpProbe(port)) return true;
      if (attempt < 2) await sleep(this.probeRetryDelayMs);
    }
    return false;
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

function toRuntimeServer(record: HostDevServerRecord): RuntimeDevServer {
  return {
    id: record.id,
    port: record.port,
    url: record.url,
    command: record.command,
    cwd: record.cwd,
    status: record.status,
    pid: record.pid,
    diagnosticCode: record.diagnosticCode,
  };
}

function isRecord(record: HostDevServerRecord | undefined): record is HostDevServerRecord {
  return Boolean(record);
}

function probeLocalhost(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 500 });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
