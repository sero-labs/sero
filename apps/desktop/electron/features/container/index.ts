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
} from './core/types';
import {
  ensureSystemRunning,
  resolveExistingContainer,
  createFreshContainer,
  inspectContainer,
  stopContainer,
  removeContainer,
  listContainers,
} from './core/lifecycle';
import { readContainerFile, writeContainerFile, listContainerFiles } from './filesystem/files';
import { TerminalManager } from './terminal';
import { ensureImage } from './core/image';
import { PortScanner } from './network/port-forward';
import { ContainerHttpProxy } from './network/http-proxy';
import { DevServerRegistry } from './registries/dev-server-registry';

export type { ContainerConfig, ContainerState, ExecResult };

const execFileAsync = promisify(execFile);

/**
 * Validate that an env var name is safe (alphanumeric + underscore only).
 * Rejects names containing shell metacharacters.
 */
function isValidEnvName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

interface ExecOptions {
  injectGitAuth?: boolean;
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
   * Optional callback that returns extra env vars for git/gh exec() calls.
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
    options?: ExecOptions,
  ): Promise<ExecResult> {
    const cid = this.getContainerId(workspaceId);
    const args = ['exec'];

    if (cwd) args.push('-w', cwd);

    // Inject env vars via container CLI's --env flags (not shell concatenation).
    // This avoids shell injection risks from env value interpolation.
    args.push('--env', 'HOST=0.0.0.0');
    if (this.proxyUrl) {
      args.push(
        '--env', `HTTP_PROXY=${this.proxyUrl}`,
        '--env', `HTTPS_PROXY=${this.proxyUrl}`,
        '--env', `http_proxy=${this.proxyUrl}`,
        '--env', `https_proxy=${this.proxyUrl}`,
        '--env', 'NO_PROXY=localhost,127.0.0.1,192.168.64.0/24',
        '--env', 'no_proxy=localhost,127.0.0.1,192.168.64.0/24',
      );
    }
    // Inject GitHub auth env vars only for explicit git/gh execs requested
    // by trusted callers such as GitRunner.
    if (this.getExtraEnvVars && options?.injectGitAuth) {
      const extra = this.getExtraEnvVars();
      for (const [key, value] of Object.entries(extra)) {
        if (!isValidEnvName(key)) {
          console.warn(`[container] Skipping invalid env var name: ${key}`);
          continue;
        }
        args.push('--env', `${key}=${value}`);
      }
    }
    args.push(cid, 'sh', '-c', command);

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
    this.portScanner.stopScanning(workspaceId);
    this.containerIps.delete(workspaceId);
    return stopContainer(workspaceId, this.containers);
  }

  async remove(workspaceId: string): Promise<void> {
    this.portScanner.stopScanning(workspaceId);
    this.containerIps.delete(workspaceId);
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
