/**
 * ContainerManager — main orchestrator.
 *
 * Composes lifecycle, file I/O, and terminal management.
 * Sub-managers (terminals, portScanner) are exposed as public readonly
 * fields instead of wrapping every method.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

import {
  CONTAINER_BIN,
  containerId,
  isXpcError,
  errorMessage,
  type ContainerConfig,
  type ContainerState,
  type ExecResult,
} from './types';
import {
  ensureSystemRunning,
  resolveExistingContainer,
  createFreshContainer,
  inspectContainer,
  stopContainer,
  removeContainer,
  listContainers,
} from './lifecycle';
import { readContainerFile, writeContainerFile, listContainerFiles } from './files';
import { TerminalManager } from './terminal';
import { ensureImage } from './image';
import { PortScanner } from './port-forward';
import { ContainerHttpProxy } from './http-proxy';
import { DevServerRegistry } from './dev-server-registry';

export type { ContainerConfig, ContainerState, ExecResult };
export { DevServerRegistry };

const execFileAsync = promisify(execFile);

/** Shell-safe quote for env values (handles tokens with special chars). */
function shQuoteValue(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export class ContainerManager {
  /** workspaceId → containerId */
  private containers = new Map<string, string>();
  /** workspaceId → container IP (cached for port forwarding) */
  private containerIps = new Map<string, string>();
  /** workspaceId → in-flight ensure() promise (deduplicates concurrent calls) */
  private ensureInflight = new Map<string, Promise<ContainerState>>();

  /** Terminal PTY management — use directly from IPC handlers. */
  readonly terminals: TerminalManager;
  /** Port detection — use directly from tools and IPC. */
  readonly portScanner = new PortScanner();
  /** Dev server registry — agent registers servers, UI manages them. */
  readonly devServers: DevServerRegistry;

  private httpProxy = new ContainerHttpProxy();
  /** Cached proxy URL once started, e.g. http://192.168.64.1:19800 */
  private proxyUrl: string | null = null;

  /**
   * Optional callback that returns extra env vars to inject into every exec().
   * Used by GitHubAuthManager to inject GH_TOKEN + git credential config.
   */
  getExtraEnvVars: (() => Record<string, string>) | null = null;

  constructor() {
    this.terminals = new TerminalManager(
      (wsId) => this.getContainerId(wsId),
    );
    this.devServers = new DevServerRegistry(this.portScanner, this);
    this.devServers.startLivenessChecks();
  }

  /** Start the HTTP proxy for container internet access. Call once at app boot. */
  async startProxy(): Promise<void> {
    try {
      this.proxyUrl = await this.httpProxy.start();
    } catch (err: unknown) {
      console.warn('[container] Failed to start HTTP proxy:', errorMessage(err));
    }
  }

  /** Environment variables expected by subprocesses that should mirror container exec networking defaults. */
  getEnvVars(): Record<string, string> {
    const env: Record<string, string> = {
      HOST: '0.0.0.0',
    };
    if (this.proxyUrl) {
      env.HTTP_PROXY = this.proxyUrl;
      env.HTTPS_PROXY = this.proxyUrl;
      env.http_proxy = this.proxyUrl;
      env.https_proxy = this.proxyUrl;
      env.NO_PROXY = 'localhost,127.0.0.1,192.168.64.0/24';
      env.no_proxy = 'localhost,127.0.0.1,192.168.64.0/24';
    }
    return env;
  }

  /* ── System ───────────────────────────────────────────────── */

  async ensureSystemRunning(): Promise<void> {
    return ensureSystemRunning();
  }

  /** Build sero-node image if not present. */
  async ensureImage(imagesDir: string): Promise<void> {
    return ensureImage(imagesDir);
  }

  /* ── Container lifecycle ──────────────────────────────────── */

  /**
   * Ensure a workspace has a running container. Creates if needed.
   * This is the primary entry point — lazy creation on first use.
   *
   * Concurrent calls for the same workspace are deduplicated: if an ensure
   * is already in-flight, the same promise is returned instead of racing.
   */
  async ensure(config: ContainerConfig): Promise<ContainerState> {
    const wsId = config.workspaceId;

    // Deduplicate: return the in-flight promise if one exists
    const inflight = this.ensureInflight.get(wsId);
    if (inflight) return inflight;

    const promise = this.ensureOnce(config).finally(() => {
      this.ensureInflight.delete(wsId);
    });
    this.ensureInflight.set(wsId, promise);
    return promise;
  }

  private async ensureOnce(config: ContainerConfig): Promise<ContainerState> {
    let state: ContainerState;
    try {
      state = await this.ensureInternal(config);
    } catch (err: unknown) {
      if (isXpcError(err)) {
        console.warn(`[container] XPC error during ensure for ${config.workspaceId}, recovering...`);
        await ensureSystemRunning();
        state = await this.ensureInternal(config);
      } else {
        throw err;
      }
    }
    // Cache IP and start continuous port scanning
    if (state.ipAddress) {
      this.containerIps.set(config.workspaceId, state.ipAddress);
      this.portScanner.startScanning(
        config.workspaceId,
        state.ipAddress,
        async (cmd) => {
          const r = await this.exec(config.workspaceId, cmd);
          return { stdout: r.stdout, exitCode: r.exitCode };
        },
      );
    }
    return state;
  }

  private async ensureInternal(config: ContainerConfig): Promise<ContainerState> {
    const cid = containerId(config.workspaceId);

    const existingState = await resolveExistingContainer(
      config.workspaceId,
      cid,
      (wsId) => this.inspect(wsId),
      this.containers,
    );
    if (existingState) return existingState;

    return createFreshContainer(
      config,
      cid,
      this.containers,
      (wsId, cmd, cwd) => this.exec(wsId, cmd, cwd),
      (wsId) => this.inspect(wsId),
      this.proxyUrl ?? undefined,
    );
  }

  /** Check if a workspace has a container registered (may not be running). */
  hasContainer(workspaceId: string): boolean {
    return this.containers.has(workspaceId);
  }

  /** Execute a command inside a workspace's container. */
  async exec(
    workspaceId: string,
    command: string,
    cwd?: string,
    timeoutMs?: number,
  ): Promise<ExecResult> {
    const cid = this.getContainerId(workspaceId);
    const args = ['exec'];

    if (cwd) args.push('-w', cwd);

    // Inject env vars: dev servers bind 0.0.0.0, proxy for internet access,
    // and GitHub auth (GH_TOKEN, git credential config) when available.
    // sh -c doesn't source profile.d, so we prepend exports directly.
    const envParts = ['export HOST=0.0.0.0'];
    if (this.proxyUrl) {
      envParts.push(
        `HTTP_PROXY=${this.proxyUrl}`,
        `HTTPS_PROXY=${this.proxyUrl}`,
        `http_proxy=${this.proxyUrl}`,
        `https_proxy=${this.proxyUrl}`,
        `NO_PROXY=localhost,127.0.0.1,192.168.64.0/24`,
        `no_proxy=localhost,127.0.0.1,192.168.64.0/24`,
      );
    }
    // Inject GitHub auth env vars (GH_TOKEN, GIT_ASKPASS, URL rewrites)
    if (this.getExtraEnvVars) {
      const extra = this.getExtraEnvVars();
      for (const [key, value] of Object.entries(extra)) {
        envParts.push(`${key}=${shQuoteValue(value)}`);
      }
    }
    const envPrefix = envParts.join(' ') + ';';
    args.push(cid, 'sh', '-c', `${envPrefix}${command}`);

    const timeout = timeoutMs ?? 120_000;

    try {
      const { stdout, stderr } = await execFileAsync(CONTAINER_BIN, args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      if (e.killed) {
        return {
          stdout: String(e.stdout ?? ''),
          stderr: `Command timed out after ${Math.round(timeout / 1000)}s. ${String(e.stderr ?? '')}`.trim(),
          exitCode: 124,
        };
      }
      return {
        stdout: String(e.stdout ?? ''),
        stderr: String(e.stderr ?? errorMessage(err)),
        exitCode: typeof e.code === 'number' ? e.code : 1,
      };
    }
  }

  async inspect(workspaceId: string): Promise<ContainerState> {
    return inspectContainer(workspaceId, this.containers);
  }

  async stop(workspaceId: string): Promise<void> {
    return stopContainer(workspaceId, this.containers);
  }

  async remove(workspaceId: string): Promise<void> {
    return removeContainer(workspaceId, this.containers);
  }

  async list(): Promise<ContainerState[]> {
    return listContainers((wsId) => this.inspect(wsId));
  }

  /* ── File I/O ─────────────────────────────────────────────── */

  async readFile(workspaceId: string, filePath: string): Promise<string> {
    return readContainerFile(workspaceId, filePath, (wsId, cmd) => this.exec(wsId, cmd));
  }

  async writeFile(workspaceId: string, filePath: string, content: string): Promise<void> {
    return writeContainerFile(workspaceId, filePath, content, this.containers, (wsId, cmd) =>
      this.exec(wsId, cmd),
    );
  }

  async listFiles(
    workspaceId: string,
    dirPath: string,
  ): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
    return listContainerFiles(workspaceId, dirPath, (wsId, cmd) => this.exec(wsId, cmd));
  }

  /* ── Port forwarding (convenience) ────────────────────────── */

  /** Stop all port scanning, forwarding, the HTTP proxy, and the dev server registry. */
  disposeAllPortForwards(): void {
    this.portScanner.disposeAll();
    this.devServers.dispose();
    this.httpProxy.stop();
  }

  /* ── Internal helpers ─────────────────────────────────────── */

  private getContainerId(workspaceId: string): string {
    return this.containers.get(workspaceId) ?? containerId(workspaceId);
  }
}
