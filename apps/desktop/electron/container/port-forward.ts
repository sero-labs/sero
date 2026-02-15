/**
 * Container port detection & bridging.
 *
 * Continuously monitors containers for listening ports and exposes
 * them via the container's own IP — NO host-side TCP proxies, so
 * container dev servers never conflict with local ones.
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

function bridgeScript(targetPort: number, bridgePort: number): string {
  return `node -e "require('net').createServer(c=>{const r=require('net').connect(${targetPort},'127.0.0.1');c.pipe(r);r.pipe(c);c.on('error',()=>r.destroy());r.on('error',()=>c.destroy())}).listen(${bridgePort},'0.0.0.0')" &`;
}

// ── PortScanner ─────────────────────────────────────────────

export class PortScanner {
  private scanners = new Map<string, ReturnType<typeof setInterval>>();
  private containerIps = new Map<string, string>();
  private execFns = new Map<string, ExecFn>();
  private bridges = new Set<number>();
  /** workspaceId → detected ports with URLs */
  private detectedPorts = new Map<string, DetectedPort[]>();
  private lastPorts = new Map<string, Set<number>>();

  private readonly SCAN_INTERVAL = 3000;

  /** Start scanning a container for listening ports. */
  startScanning(wsId: string, containerIp: string, execFn: ExecFn): void {
    if (this.scanners.has(wsId)) return;
    this.containerIps.set(wsId, containerIp);
    this.execFns.set(wsId, execFn);
    this.lastPorts.set(wsId, new Set());
    this.detectedPorts.set(wsId, []);
    this.scan(wsId);
    this.scanners.set(wsId, setInterval(() => this.scan(wsId), this.SCAN_INTERVAL));
  }

  /** Stop scanning a container. */
  stopScanning(wsId: string): void {
    const t = this.scanners.get(wsId);
    if (t) clearInterval(t);
    this.scanners.delete(wsId);
    this.containerIps.delete(wsId);
    this.execFns.delete(wsId);
    this.lastPorts.delete(wsId);
    this.detectedPorts.delete(wsId);
  }

  /** Trigger an immediate scan (e.g. after bash command). */
  triggerScan(wsId: string): void { this.scan(wsId); }

  /** Get detected ports for a workspace. */
  getPorts(wsId: string): DetectedPort[] {
    return this.detectedPorts.get(wsId) ?? [];
  }

  /** Get the container IP for a workspace. */
  getIp(wsId: string): string | undefined {
    return this.containerIps.get(wsId);
  }

  disposeAll(): void {
    for (const [wsId] of this.scanners) this.stopScanning(wsId);
    this.bridges.clear();
  }

  // ── Internal ──────────────────────────────────────────

  private async scan(wsId: string): Promise<void> {
    const execFn = this.execFns.get(wsId);
    const ip = this.containerIps.get(wsId);
    if (!execFn || !ip) return;

    try {
      const result = await execFn('ss -tlnp 2>/dev/null');
      if (result.exitCode !== 0) return;

      const ports = parseListeningPorts(result.stdout);
      const currentSet = new Set<number>();
      const detected: DetectedPort[] = [];

      for (const { port, public: isPublic } of ports) {
        if (SYSTEM_PORTS.has(port)) continue;
        currentSet.add(port);

        if (isPublic) {
          detected.push({ port, url: `http://${ip}:${port}`, bridged: false });
        } else {
          // Needs bridge to be reachable via container IP
          const bridgePort = port + BRIDGE_OFFSET;
          await this.ensureBridge(wsId, port, execFn);
          detected.push({ port, url: `http://${ip}:${bridgePort}`, bridged: true });
        }
      }

      // Clean up bridges for ports that stopped listening
      const prevPorts = this.lastPorts.get(wsId) ?? new Set();
      for (const old of prevPorts) {
        if (!currentSet.has(old) && this.bridges.has(old)) {
          this.bridges.delete(old);
        }
      }

      this.lastPorts.set(wsId, currentSet);
      this.detectedPorts.set(wsId, detected);
    } catch { /* container may have stopped */ }
  }

  private async ensureBridge(wsId: string, port: number, execFn: ExecFn): Promise<void> {
    if (this.bridges.has(port)) return;
    const bridgePort = port + BRIDGE_OFFSET;
    try {
      await execFn(`${bridgeScript(port, bridgePort)} sleep 0.5`);
      this.bridges.add(port);
      console.log(`[ports] Bridge: 0.0.0.0:${bridgePort} → 127.0.0.1:${port} (${wsId})`);
    } catch {
      console.warn(`[ports] Failed to bridge port ${port} in ${wsId}`);
    }
  }
}
