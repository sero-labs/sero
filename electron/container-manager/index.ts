/**
 * ContainerManager — main orchestrator.
 * Composes lifecycle, file I/O, and terminal management into a single public API.
 *
 * Re-exports all types so consumers can keep using:
 *   import { ContainerManager, ContainerConfig, ... } from './container-manager';
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';
import { loadEnvVars } from '../persistence';

import {
  CONTAINER_BIN, containerId, isXpcError,
  type ContainerConfig, type ContainerState, type ExecResult,
} from './types';
import {
  ensureSystemRunning,
  resolveExistingContainer,
  createFreshContainer,
  inspectContainer,
  stopContainer,
  removeContainer,
  listContainers,
} from './container-lifecycle';
import { readContainerFile, writeContainerFile, listContainerFiles } from './container-files';
import { TerminalManager } from './container-terminal';

export type { ContainerConfig, ContainerState, ExecResult };

const execFileAsync = promisify(execFile);

export class ContainerManager extends EventEmitter {
  // projectId → containerId (same by convention: sero-<projectId>)
  private containers = new Map<string, string>();
  private terminalManager: TerminalManager;

  // Cached env vars (refreshed on demand)
  private envVarsCache: Record<string, string> | null = null;
  private envVarsCacheTime = 0;

  constructor() {
    super();
    this.terminalManager = new TerminalManager(
      this,
      (pid) => this.getContainerId(pid),
      () => this.getEnvVars(),
    );
  }

  /* ── Env vars ─────────────────────────────────────────────── */

  /** Get env vars from Sero settings, cached for 5s to avoid disk reads on every exec */
  getEnvVars(): Record<string, string> {
    const now = Date.now();
    if (!this.envVarsCache || now - this.envVarsCacheTime > 5000) {
      this.envVarsCache = loadEnvVars();
      this.envVarsCacheTime = now;
    }
    return this.envVarsCache;
  }

  /** Invalidate env vars cache (called after settings change) */
  invalidateEnvCache(): void {
    this.envVarsCache = null;
  }

  /* ── System ───────────────────────────────────────────────── */

  async ensureSystemRunning(): Promise<void> {
    return ensureSystemRunning();
  }

  /* ── Container lifecycle ──────────────────────────────────── */

  async create(config: ContainerConfig): Promise<ContainerState> {
    try {
      return await this.createInternal(config);
    } catch (err: any) {
      if (isXpcError(err)) {
        console.warn(`[sero] XPC error during create for ${config.id}, recovering API server...`);
        await ensureSystemRunning();
        return await this.createInternal(config);
      }
      throw err;
    }
  }

  private async createInternal(config: ContainerConfig): Promise<ContainerState> {
    const cid = containerId(config.id);

    const existingState = await resolveExistingContainer(
      config.id, cid,
      (pid) => this.inspect(pid),
      this.containers,
    );
    if (existingState) return existingState;

    return createFreshContainer(
      config, cid,
      this.containers,
      (pid, cmd, cwd) => this.exec(pid, cmd, cwd),
      (pid) => this.inspect(pid),
    );
  }

  async exec(projectId: string, command: string, cwd?: string): Promise<ExecResult> {
    const cid = this.getContainerId(projectId);
    const args = ['exec'];

    if (cwd) args.push('-w', cwd);

    for (const [k, v] of Object.entries(this.getEnvVars())) {
      args.push('-e', `${k}=${v}`);
    }

    args.push(cid, 'sh', '-c', command);

    try {
      const { stdout, stderr } = await execFileAsync(CONTAINER_BIN, args, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (err: any) {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? err.message,
        exitCode: err.code ?? 1,
      };
    }
  }

  async inspect(projectId: string): Promise<ContainerState> {
    return inspectContainer(projectId, this.containers);
  }

  async stop(projectId: string): Promise<void> {
    return stopContainer(projectId, this.containers);
  }

  async remove(projectId: string): Promise<void> {
    return removeContainer(projectId, this.containers);
  }

  async list(): Promise<ContainerState[]> {
    return listContainers((pid) => this.inspect(pid));
  }

  /* ── File I/O ─────────────────────────────────────────────── */

  async readFile(projectId: string, filePath: string): Promise<string> {
    return readContainerFile(projectId, filePath, this.containers, (pid, cmd, cwd) => this.exec(pid, cmd, cwd));
  }

  async writeFile(projectId: string, filePath: string, content: string): Promise<void> {
    return writeContainerFile(projectId, filePath, content, this.containers, (pid, cmd, cwd) => this.exec(pid, cmd, cwd));
  }

  async listFiles(projectId: string, dirPath: string) {
    return listContainerFiles(projectId, dirPath, (pid, cmd, cwd) => this.exec(pid, cmd, cwd));
  }

  /* ── Terminal management (delegated) ──────────────────────── */

  createTerminal(projectId: string, terminalId: string, cols?: number, rows?: number): IPty {
    return this.terminalManager.createTerminal(projectId, terminalId, cols, rows);
  }

  getTerminal(terminalId: string): IPty | undefined {
    return this.terminalManager.getTerminal(terminalId);
  }

  readTerminalOutput(terminalId: string, lines?: number): string {
    return this.terminalManager.readTerminalOutput(terminalId, lines);
  }

  readProjectTerminalOutput(projectId: string, lines?: number): string {
    return this.terminalManager.readProjectTerminalOutput(projectId, lines);
  }

  disposeTerminal(terminalId: string): void {
    this.terminalManager.disposeTerminal(terminalId);
  }

  disposeProjectTerminals(projectId: string): void {
    this.terminalManager.disposeProjectTerminals(projectId);
  }

  disposeAllTerminals(): void {
    this.terminalManager.disposeAllTerminals();
  }

  /* ── Internal helpers ─────────────────────────────────────── */

  private getContainerId(projectId: string): string {
    return this.containers.get(projectId) ?? containerId(projectId);
  }
}
