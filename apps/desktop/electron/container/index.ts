/**
 * ContainerManager — main orchestrator.
 * Composes lifecycle, file I/O, and terminal management into a single public API.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';

import {
  CONTAINER_BIN,
  WORKSPACE_MOUNT,
  containerId,
  isXpcError,
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
import { PortScanner, type DetectedPort } from './port-forward';
import { ContainerHttpProxy } from './http-proxy';

export type { ContainerConfig, ContainerState, ExecResult };

const execFileAsync = promisify(execFile);

export class ContainerManager extends EventEmitter {
  /** workspaceId → containerId */
  private containers = new Map<string, string>();
  /** workspaceId → container IP (cached for port forwarding) */
  private containerIps = new Map<string, string>();
  private terminalManager: TerminalManager;
  private portScanner = new PortScanner();
  private httpProxy = new ContainerHttpProxy();
  /** Cached proxy URL once started, e.g. http://192.168.64.1:19800 */
  private proxyUrl: string | null = null;

  constructor() {
    super();
    this.terminalManager = new TerminalManager(
      this,
      (wsId) => this.getContainerId(wsId),
    );
  }

  /** Start the HTTP proxy for container internet access. Call once at app boot. */
  async startProxy(): Promise<void> {
    try {
      this.proxyUrl = await this.httpProxy.start();
    } catch (err: any) {
      console.warn('[container] Failed to start HTTP proxy:', err.message);
    }
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
   */
  async ensure(config: ContainerConfig): Promise<ContainerState> {
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
      this.httpProxy.getProxyUrl(),
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

    // Inject env vars: dev servers bind 0.0.0.0, proxy for internet access.
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
    const envPrefix = envParts.join(' ') + ';';
    args.push(cid, 'sh', '-c', `${envPrefix}${command}`);

    const timeout = timeoutMs ?? 120_000;

    try {
      const { stdout, stderr } = await execFileAsync(CONTAINER_BIN, args, {
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: any) {
      if (err.killed) {
        return {
          stdout: err.stdout ?? '',
          stderr: `Command timed out after ${Math.round(timeout / 1000)}s. ${err.stderr ?? ''}`.trim(),
          exitCode: 124,
        };
      }
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message,
        exitCode: typeof err.code === 'number' ? err.code : 1,
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

  /* ── Terminal management (delegated) ──────────────────────── */

  createTerminal(workspaceId: string, terminalId: string, cols?: number, rows?: number): IPty {
    return this.terminalManager.createTerminal(workspaceId, terminalId, cols, rows);
  }

  getTerminal(terminalId: string): IPty | undefined {
    return this.terminalManager.getTerminal(terminalId);
  }

  readTerminalOutput(terminalId: string, lines?: number): string {
    return this.terminalManager.readTerminalOutput(terminalId, lines);
  }

  /** Get the full raw output buffer for xterm.js replay on remount. */
  getReplayBuffer(terminalId: string): string {
    return this.terminalManager.getReplayBuffer(terminalId);
  }

  readWorkspaceTerminalOutput(workspaceId: string, lines?: number): string {
    return this.terminalManager.readWorkspaceTerminalOutput(workspaceId, lines);
  }

  disposeTerminal(terminalId: string): void {
    this.terminalManager.disposeTerminal(terminalId);
  }

  disposeWorkspaceTerminals(workspaceId: string): void {
    this.terminalManager.disposeWorkspaceTerminals(workspaceId);
  }

  disposeAllTerminals(): void {
    this.terminalManager.disposeAllTerminals();
  }

  /* ── Port forwarding ──────────────────────────────────────── */

  /** Trigger an immediate port scan (e.g. after bash command). */
  triggerPortScan(workspaceId: string): void {
    this.portScanner.triggerScan(workspaceId);
  }

  /** Get detected listening ports for a workspace. */
  getDetectedPorts(workspaceId: string): DetectedPort[] {
    return this.portScanner.getPorts(workspaceId);
  }

  /** Stop port scanning/forwarding for a workspace. */
  stopPortForwarding(workspaceId: string): void {
    this.portScanner.stopScanning(workspaceId);
  }

  /** Stop all port scanning, forwarding, and the HTTP proxy. */
  disposeAllPortForwards(): void {
    this.portScanner.disposeAll();
    this.httpProxy.stop();
  }

  /* ── Internal helpers ─────────────────────────────────────── */

  private getContainerId(workspaceId: string): string {
    return this.containers.get(workspaceId) ?? containerId(workspaceId);
  }
}
