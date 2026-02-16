/**
 * Dev Server Registry — tracks dev servers registered by the agent.
 *
 * Servers are registered via the `register_dev_server` agent tool and
 * stored in-memory (ephemeral — they don't survive app restart).
 * Cross-references PortScanner for liveness and URL resolution.
 *
 * The registry emits events so IPC handlers can push updates to the renderer.
 */

import type { DevServer } from '../../src/types/ipc';
import type { PortScanner } from './port-forward';
import type { ContainerManager } from './index';

export type DevServerChangeEvent =
  | { type: 'registered'; server: DevServer }
  | { type: 'unregistered'; serverId: string }
  | { type: 'status_changed'; serverId: string; status: DevServer['status'] };

type ChangeListener = (event: DevServerChangeEvent) => void;

export interface RegisterDevServerParams {
  workspaceId: string;
  name: string;
  port: number;
  command: string;
  framework?: string;
}

export class DevServerRegistry {
  /** All registered servers: key = `${workspaceId}:${port}` */
  private servers = new Map<string, DevServer>();
  private listeners = new Set<ChangeListener>();
  private livenessTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private portScanner: PortScanner,
    private containerManager: ContainerManager,
  ) {}

  /** Start periodic liveness checks (call once at startup). */
  startLivenessChecks(intervalMs = 5000): void {
    if (this.livenessTimer) return;
    this.livenessTimer = setInterval(() => this.checkLiveness(), intervalMs);
  }

  /** Stop liveness checks. */
  stopLivenessChecks(): void {
    if (this.livenessTimer) {
      clearInterval(this.livenessTimer);
      this.livenessTimer = null;
    }
  }

  // ── Registration ──────────────────────────────────────────

  /**
   * Register a dev server. Called by the agent tool.
   * Returns the created DevServer.
   */
  register(params: RegisterDevServerParams): DevServer {
    const { workspaceId, name, port, command, framework } = params;
    const id = `${workspaceId}:${port}`;

    // Resolve URL from port scanner (uses container IP)
    const detectedPorts = this.portScanner.getPorts(workspaceId);
    const detected = detectedPorts.find((p) => p.port === port);
    const containerIp = this.portScanner.getIp(workspaceId);
    const url = detected?.url ?? (containerIp ? `http://${containerIp}:${port}` : `http://localhost:${port}`);

    const server: DevServer = {
      id,
      workspaceId,
      name,
      port,
      url,
      framework,
      command,
      status: detected ? 'running' : 'starting',
      registeredAt: new Date().toISOString(),
    };

    this.servers.set(id, server);
    this.emit({ type: 'registered', server });
    console.log(`[dev-server] Registered: ${name} (${url})`);
    return server;
  }

  /** Unregister a server (does not stop the process). */
  unregister(serverId: string): boolean {
    if (!this.servers.has(serverId)) return false;
    this.servers.delete(serverId);
    this.emit({ type: 'unregistered', serverId });
    console.log(`[dev-server] Unregistered: ${serverId}`);
    return true;
  }

  // ── Queries ───────────────────────────────────────────────

  /** List all registered servers, optionally filtered by workspace. */
  list(workspaceId?: string): DevServer[] {
    const all = Array.from(this.servers.values());
    if (!workspaceId) return all;
    return all.filter((s) => s.workspaceId === workspaceId);
  }

  /** Get a single server by ID. */
  get(serverId: string): DevServer | undefined {
    return this.servers.get(serverId);
  }

  // ── Process management ────────────────────────────────────

  /**
   * Kill all processes bound to a port inside a container.
   *
   * node:22-slim doesn't have fuser/lsof, so we use `ss -tlnp` to find
   * PIDs, then kill each PID's entire process group (`kill -TERM -- -<PGID>`)
   * so that setsid-launched process trees are fully cleaned up.
   */
  private async killPort(workspaceId: string, port: number): Promise<boolean> {
    // 1. Find PIDs listening on the port via ss (always available)
    const findPids = `ss -tlnp sport = :${port} 2>/dev/null | grep -oP 'pid=\\K[0-9]+' | sort -u`;
    const result = await this.containerManager.exec(workspaceId, findPids);
    const pids = result.stdout.trim().split('\n').filter(Boolean);

    if (pids.length === 0) {
      // Fallback: try pkill with the port number in case ss didn't find PIDs
      await this.containerManager.exec(workspaceId, `pkill -f "port ${port}" 2>/dev/null`);
      return true;
    }

    // 2. For each PID, find its process group and kill the whole group
    for (const pid of pids) {
      // Get the process group ID from /proc
      const pgidResult = await this.containerManager.exec(
        workspaceId,
        `cat /proc/${pid}/stat 2>/dev/null | awk '{print $5}'`,
      );
      const pgid = pgidResult.stdout.trim();

      if (pgid && pgid !== '0' && pgid !== '1') {
        // Kill entire process group (negative PID = group)
        await this.containerManager.exec(workspaceId, `kill -TERM -- -${pgid} 2>/dev/null`);
      } else {
        // Fallback: kill just the PID
        await this.containerManager.exec(workspaceId, `kill -TERM ${pid} 2>/dev/null`);
      }
    }

    // 3. Wait briefly, then force-kill anything still on the port
    await new Promise((r) => setTimeout(r, 500));
    const stragglers = await this.containerManager.exec(workspaceId, findPids);
    const remaining = stragglers.stdout.trim().split('\n').filter(Boolean);
    for (const pid of remaining) {
      await this.containerManager.exec(workspaceId, `kill -9 ${pid} 2>/dev/null`);
    }

    return true;
  }

  /** Stop a dev server by killing its process tree inside the container. */
  async stop(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) return false;

    try {
      await this.killPort(server.workspaceId, server.port);
      server.status = 'stopped';
      this.emit({ type: 'status_changed', serverId, status: 'stopped' });
      console.log(`[dev-server] Stopped: ${server.name} (port ${server.port})`);
      return true;
    } catch (err) {
      console.error(`[dev-server] Failed to stop ${serverId}:`, err);
      return false;
    }
  }

  /** Restart a dev server: stop it, then re-run its original command. */
  async restart(serverId: string): Promise<boolean> {
    const server = this.servers.get(serverId);
    if (!server) return false;

    // Stop first
    await this.stop(serverId);

    // Wait for port release
    await new Promise((r) => setTimeout(r, 1500));

    // Re-run the original command (background, detached)
    try {
      server.status = 'starting';
      this.emit({ type: 'status_changed', serverId, status: 'starting' });

      const escaped = server.command.replace(/'/g, "'\\''");
      const bgCmd = `setsid sh -c 'cd /workspace && ${escaped} > /tmp/dev-server-${server.port}.log 2>&1 &'`;
      await this.containerManager.exec(server.workspaceId, bgCmd);
      console.log(`[dev-server] Restarting: ${server.name} (port ${server.port})`);

      // Trigger port scan to pick up the new process
      this.portScanner.triggerScan(server.workspaceId);
      return true;
    } catch (err) {
      console.error(`[dev-server] Failed to restart ${serverId}:`, err);
      server.status = 'stopped';
      this.emit({ type: 'status_changed', serverId, status: 'stopped' });
      return false;
    }
  }

  // ── Liveness ──────────────────────────────────────────────

  /** Check all registered servers against PortScanner data. */
  private checkLiveness(): void {
    for (const server of this.servers.values()) {
      const detectedPorts = this.portScanner.getPorts(server.workspaceId);
      const isListening = detectedPorts.some((p) => p.port === server.port);
      const newStatus: DevServer['status'] = isListening ? 'running' : 'stopped';

      if (server.status !== newStatus && server.status !== 'starting') {
        server.status = newStatus;
        // Update URL if port scanner has a fresher one
        if (isListening) {
          const detected = detectedPorts.find((p) => p.port === server.port);
          if (detected) server.url = detected.url;
        }
        this.emit({ type: 'status_changed', serverId: server.id, status: newStatus });
      }
    }
  }

  // ── Events ────────────────────────────────────────────────

  /** Subscribe to registry change events. Returns unsubscribe function. */
  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DevServerChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[dev-server] Listener error:', err);
      }
    }
  }

  /** Clean up on shutdown. */
  dispose(): void {
    this.stopLivenessChecks();
    this.listeners.clear();
    this.servers.clear();
  }
}
