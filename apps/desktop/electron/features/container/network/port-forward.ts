/**
 * Legacy Apple Container port scanner kept only for older registry callers.
 * Runtime backends own preview forwarding via loopback host-port pools.
 */

export interface DetectedPort {
  port: number;
  url: string;
  bridged: boolean;
}

type ExecFn = (cmd: string) => Promise<{ stdout: string; exitCode: number }>;

interface WorkspaceScanState {
  timer: ReturnType<typeof setInterval>;
  host: string;
  execFn: ExecFn;
  detected: DetectedPort[];
  scanPromise: Promise<void> | null;
}

export class PortScanner {
  private workspaces = new Map<string, WorkspaceScanState>();
  private readonly SCAN_INTERVAL = 3000;

  startScanning(wsId: string, host: string, execFn: ExecFn): void {
    if (this.workspaces.has(wsId)) return;
    const state: WorkspaceScanState = {
      timer: setInterval(() => { void this.runScan(wsId); }, this.SCAN_INTERVAL),
      host,
      execFn,
      detected: [],
      scanPromise: null,
    };
    this.workspaces.set(wsId, state);
    void this.runScan(wsId);
  }

  async stopScanning(wsId: string): Promise<void> {
    const state = this.workspaces.get(wsId);
    if (!state) return;
    clearInterval(state.timer);
    this.workspaces.delete(wsId);
    await state.scanPromise?.catch(() => undefined);
  }

  triggerScan(wsId: string): void {
    void this.runScan(wsId);
  }

  getPorts(wsId: string): DetectedPort[] {
    return this.workspaces.get(wsId)?.detected ?? [];
  }

  getIp(wsId: string): string | undefined {
    return this.workspaces.get(wsId)?.host;
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled(Array.from(this.workspaces.keys()).map((wsId) => this.stopScanning(wsId)));
  }

  private runScan(wsId: string): Promise<void> | undefined {
    const state = this.workspaces.get(wsId);
    if (!state) return undefined;
    if (state.scanPromise) return state.scanPromise;
    const promise = this.scan(state).finally(() => {
      if (state.scanPromise === promise) state.scanPromise = null;
    });
    state.scanPromise = promise;
    return promise;
  }

  private async scan(state: WorkspaceScanState): Promise<void> {
    const result = await state.execFn('ss -tlnp 2>/dev/null');
    if (result.exitCode !== 0) {
      state.detected = [];
      return;
    }
    state.detected = parseListeningPorts(result.stdout).map((port) => ({
      port,
      url: `http://${state.host}:${port}`,
      bridged: false,
    }));
  }
}

function parseListeningPorts(ssOutput: string): number[] {
  const seen = new Set<number>();
  for (const line of ssOutput.split('\n')) {
    if (!line.includes('LISTEN')) continue;
    const match = line.match(/LISTEN\s+\d+\s+\d+\s+[\w.:*\[\]]+:(\d+)/);
    const port = Number(match?.[1]);
    if (port && port < 65536 && ![22, 80, 443].includes(port)) seen.add(port);
  }
  return Array.from(seen);
}
