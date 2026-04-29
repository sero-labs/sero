/**
 * Container port detection & bridging.
 *
 * Monitors containers for listening ports on-demand (after bash commands)
 * and via a background interval. Exposes them via the container's own IP.
 *
 * For servers bound to 127.0.0.1 inside the container, a Node.js
 * bridge is started to re-expose them on 0.0.0.0 so the container
 * IP can reach them.
 */

// ── Types ───────────────────────────────────────────────────

export interface DetectedPort {
  port: number;
  /** The URL to access this server from the host. */
  url: string;
  /** Whether a bridge was needed (server was localhost-only). */
  bridged: boolean;
}

type ExecFn = (cmd: string) => Promise<{ stdout: string; exitCode: number }>;

/** Per-workspace scan state — all fields for one workspace in a single object. */
interface WorkspaceScanState {
  timer: ReturnType<typeof setInterval>;
  containerIp: string;
  execFn: ExecFn;
  /** Ports detected in the most recent scan. */
  detected: DetectedPort[];
  /** Port numbers from the previous scan (for bridge cleanup). */
  lastPorts: Set<number>;
  /** Port numbers that have an active bridge. */
  bridges: Set<number>;
  /** In-flight scan promise so trigger/interval scans coalesce and teardown can await cleanup. */
  scanPromise: Promise<void> | null;
}

// ── Port parsing ────────────────────────────────────────────

interface ListeningPort {
  port: number;
  /** true if bound to 0.0.0.0 / :: / * (reachable via container IP) */
  public: boolean;
}

const SYSTEM_PORTS = new Set([22, 80, 443]);

function parseListeningPorts(ssOutput: string): ListeningPort[] {
  const result: ListeningPort[] = [];
  const seen = new Set<number>();
  for (const line of ssOutput.split('\n')) {
    if (!line.includes('LISTEN')) continue;
    const match = line.match(/LISTEN\s+\d+\s+\d+\s+([\w.:*\[\]]+):(\d+)/);
    if (!match) continue;
    const addr = match[1];
    const port = parseInt(match[2], 10);
    if (!port || port >= 65536 || seen.has(port)) continue;
    seen.add(port);
    const isPublic = addr === '0.0.0.0' || addr === '::' || addr === '*' || addr === '[::]';
    result.push({ port, public: isPublic });
  }
  return result;
}

// ── Bridge for localhost-bound servers ───────────────────────

const BRIDGE_OFFSET = 20000;

function bridgeMarker(wsId: string, targetPort: number): string {
  return `sero-port-bridge-${wsId}-${targetPort}`;
}

function bridgeScript(wsId: string, targetPort: number, bridgePort: number): string {
  const marker = bridgeMarker(wsId, targetPort);
  return `node -e "process.title='${marker}';require('net').createServer(c=>{const r=require('net').connect(${targetPort},'127.0.0.1');c.pipe(r);r.pipe(c);c.on('error',()=>r.destroy());r.on('error',()=>c.destroy())}).listen(${bridgePort},'0.0.0.0')" &`;
}

function stopBridgeCommand(wsId: string, targetPort: number): string {
  const marker = bridgeMarker(wsId, targetPort);
  return `pkill -f '${marker}' >/dev/null 2>&1 || true`;
}

// ── PortScanner ─────────────────────────────────────────────

export class PortScanner {
  /** All per-workspace state in a single map. */
  private workspaces = new Map<string, WorkspaceScanState>();

  private readonly SCAN_INTERVAL = 3000;

  /** Start scanning a container for listening ports. */
  startScanning(wsId: string, containerIp: string, execFn: ExecFn): void {
    if (this.workspaces.has(wsId)) return;

    const state: WorkspaceScanState = {
      timer: setInterval(() => {
        void this.runScan(wsId);
      }, this.SCAN_INTERVAL),
      containerIp,
      execFn,
      detected: [],
      lastPorts: new Set(),
      bridges: new Set(),
      scanPromise: null,
    };

    this.workspaces.set(wsId, state);
    void this.runScan(wsId); // immediate first scan
  }

  /** Stop scanning a container. */
  async stopScanning(wsId: string): Promise<void> {
    const state = this.workspaces.get(wsId);
    if (!state) return;
    clearInterval(state.timer);
    this.workspaces.delete(wsId);
    await state.scanPromise?.catch(() => undefined);
    await this.resetWorkspaceState(state, wsId);
  }

  /** Trigger an immediate scan (e.g. after a bash command). Non-blocking. */
  triggerScan(wsId: string): void {
    void this.runScan(wsId);
  }

  /** Get detected ports for a workspace (from the most recent scan). */
  getPorts(wsId: string): DetectedPort[] {
    return this.workspaces.get(wsId)?.detected ?? [];
  }

  /** Get the container IP for a workspace. */
  getIp(wsId: string): string | undefined {
    return this.workspaces.get(wsId)?.containerIp;
  }

  async disposeAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.workspaces.keys()).map((wsId) => this.stopScanning(wsId)),
    );
  }

  private runScan(wsId: string): Promise<void> | undefined {
    const state = this.workspaces.get(wsId);
    if (!state) return undefined;
    if (state.scanPromise) return state.scanPromise;

    const scanPromise = this.scan(wsId, state).finally(() => {
      if (state.scanPromise === scanPromise) {
        state.scanPromise = null;
      }
    });
    state.scanPromise = scanPromise;
    return scanPromise;
  }

  // ── Internal ──────────────────────────────────────────

  private async scan(wsId: string, state: WorkspaceScanState): Promise<void> {
    try {
      const result = await state.execFn('ss -tlnp 2>/dev/null');
      if (result.exitCode !== 0) {
        await this.resetWorkspaceState(state, wsId);
        return;
      }

      const ports = parseListeningPorts(result.stdout);
      const currentSet = new Set<number>();
      const detected: DetectedPort[] = [];

      for (const { port, public: isPublic } of ports) {
        if (SYSTEM_PORTS.has(port)) continue;
        currentSet.add(port);

        if (isPublic) {
          detected.push({ port, url: `http://${state.containerIp}:${port}`, bridged: false });
        } else {
          // Needs bridge to be reachable via container IP
          const bridgePort = port + BRIDGE_OFFSET;
          await this.ensureBridge(state, wsId, port);
          detected.push({ port, url: `http://${state.containerIp}:${bridgePort}`, bridged: true });
        }
      }

      // Clean up bridges for ports that stopped listening
      for (const old of state.lastPorts) {
        if (!currentSet.has(old) && state.bridges.has(old)) {
          await this.stopBridge(state, wsId, old);
        }
      }

      state.lastPorts = currentSet;
      state.detected = detected;
    } catch {
      await this.resetWorkspaceState(state, wsId);
    }
  }

  private async resetWorkspaceState(state: WorkspaceScanState, wsId: string): Promise<void> {
    await Promise.allSettled(
      Array.from(state.bridges).map((port) => state.execFn(stopBridgeCommand(wsId, port))),
    );
    state.bridges.clear();
    state.detected = [];
    state.lastPorts.clear();
  }

  private async ensureBridge(
    state: WorkspaceScanState,
    wsId: string,
    port: number,
  ): Promise<void> {
    if (state.bridges.has(port)) return;
    const bridgePort = port + BRIDGE_OFFSET;
    try {
      await state.execFn(stopBridgeCommand(wsId, port));
      await state.execFn(`${bridgeScript(wsId, port, bridgePort)} sleep 0.5`);
      state.bridges.add(port);
      console.log(`[ports] Bridge: 0.0.0.0:${bridgePort} → 127.0.0.1:${port} (${wsId})`);
    } catch {
      console.warn(`[ports] Failed to bridge port ${port} in ${wsId}`);
    }
  }

  private async stopBridge(state: WorkspaceScanState, wsId: string, port: number): Promise<void> {
    if (!state.bridges.has(port)) return;
    try {
      await state.execFn(stopBridgeCommand(wsId, port));
    } catch {
      // best effort
    }
    state.bridges.delete(port);
  }
}
