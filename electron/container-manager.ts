import { execFile, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { IPty } from 'node-pty';

const execFileAsync = promisify(execFile);

const CONTAINER_BIN = '/usr/local/bin/container';
const DEFAULT_IMAGE = 'sero-node:latest';
const DEFAULT_CPUS = 2;
const DEFAULT_MEMORY_MB = 1024;
const SERO_LABEL_KEY = 'sero.project';

export interface ContainerConfig {
  id: string;
  name: string;
  image?: string;
  cpus?: number;
  memoryMB?: number;
  ports?: Array<{ host: number; container: number }>;
  volumes?: Array<{ hostPath: string; containerPath: string; readonly?: boolean }>;
}

export interface ContainerState {
  id: string;
  image: string;
  state: 'running' | 'stopped' | 'unknown';
  ipAddress?: string;
  cpus: number;
  memoryBytes: number;
  ports: Array<{ host: number; container: number }>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Ring buffer that keeps the last N characters of terminal output
class TerminalOutputBuffer {
  private buffer = '';
  private maxSize: number;

  constructor(maxSize = 32_000) {
    this.maxSize = maxSize;
  }

  append(data: string): void {
    this.buffer += data;
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }
  }

  /** Get the last `n` characters (default: all) */
  read(n?: number): string {
    if (n && n < this.buffer.length) {
      return this.buffer.slice(-n);
    }
    return this.buffer;
  }

  /** Get only the last `n` lines */
  readLines(n = 100): string {
    const lines = this.buffer.split('\n');
    return lines.slice(-n).join('\n');
  }

  clear(): void {
    this.buffer = '';
  }
}

export class ContainerManager extends EventEmitter {
  // projectId → containerId (they're the same by convention: sero-<projectId>)
  private containers = new Map<string, string>();
  // terminalId → node-pty instance (real PTY for interactive shells)
  private terminals = new Map<string, IPty>();
  // terminalId → output buffer (captures terminal output for agent visibility)
  private terminalBuffers = new Map<string, TerminalOutputBuffer>();
  // projectId → [terminalId, ...] mapping
  private projectTerminals = new Map<string, string[]>();

  private containerId(projectId: string): string {
    return `sero-${projectId}`;
  }

  /** Host directory for a project's workspace files (persists across container lifecycle) */
  private hostWorkspacePath(projectId: string): string {
    return path.join(os.homedir(), '.sero', 'workspaces', projectId);
  }

  /** Ensure the host workspace directory exists */
  private ensureWorkspaceDir(projectId: string): string {
    const dir = this.hostWorkspacePath(projectId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Spawn a new container for a project.
   * Boots a lightweight Linux VM with the configured image, resources, and ports.
   */
  async create(config: ContainerConfig): Promise<ContainerState> {
    const cid = this.containerId(config.id);

    // If container already exists, handle it
    try {
      const existing = await this.inspect(config.id);
      if (existing.state === 'running') {
        this.containers.set(config.id, cid);
        return existing;
      }

      // Exists but stopped — try to start it
      console.log(`[sero] Container ${cid} exists but stopped, starting...`);
      try {
        await execFileAsync(CONTAINER_BIN, ['start', cid], { timeout: 30_000 });
        this.containers.set(config.id, cid);
        return await this.inspect(config.id);
      } catch (startErr: any) {
        // Start failed (e.g. corrupted storage) — delete and recreate
        // Files are safe on host via bind mount
        console.warn(`[sero] Failed to start ${cid}, will delete and recreate:`, startErr?.message);
        try {
          await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
          console.log(`[sero] Deleted ${cid}, will recreate`);
        } catch (delErr: any) {
          console.warn(`[sero] Delete also failed for ${cid}:`, delErr?.message);
          // Last resort: restart the container API server to clear ghost state
          console.log(`[sero] Resetting container API server to clear ghost...`);
          try {
            await execFileAsync(CONTAINER_BIN, ['system', 'stop'], { timeout: 15_000 });
            await new Promise(r => setTimeout(r, 2000));
            await execFileAsync(CONTAINER_BIN, ['system', 'start'], { timeout: 15_000 });
            await new Promise(r => setTimeout(r, 3000));
            console.log(`[sero] API server restarted, proceeding to recreate ${cid}`);
          } catch (resetErr: any) {
            throw new Error(`Cannot recover container ${cid}: ${resetErr?.message}`);
          }
        }
      }
    } catch (err: any) {
      if (err?.message?.startsWith('Cannot recover')) throw err;

      // inspect failed — container doesn't exist at all, or we just cleared it
      try {
        await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
      } catch {
        // Truly doesn't exist — good, proceed to create
      }
    }

    // Ensure host workspace directory exists for bind mount
    const hostWorkspace = this.ensureWorkspaceDir(config.id);

    const args: string[] = [
      'run',
      '--name', cid,
      '-d',
      '--cpus', String(config.cpus ?? DEFAULT_CPUS),
      '--memory', `${config.memoryMB ?? DEFAULT_MEMORY_MB}M`,
      '--network', 'default',
      '-l', `${SERO_LABEL_KEY}=${config.id}`,
      '--volume', `${hostWorkspace}:/workspace`,
    ];

    // Port mappings
    const ports = config.ports ?? [];
    for (const port of ports) {
      args.push('-p', `${port.host}:${port.container}`);
    }

    // Additional volume mounts
    if (config.volumes) {
      for (const vol of config.volumes) {
        let mount = `type=bind,source=${vol.hostPath},target=${vol.containerPath}`;
        if (vol.readonly) mount += ',readonly';
        args.push('--mount', mount);
      }
    }

    // Image and entrypoint — keep container alive
    args.push(config.image ?? DEFAULT_IMAGE, 'sleep', 'infinity');

    try {
      await execFileAsync(CONTAINER_BIN, args, { timeout: 30_000 });
    } catch (err: any) {
      throw new Error(`Failed to create container ${cid}: ${err.stderr || err.message}`);
    }

    this.containers.set(config.id, cid);

    // Initialize workspace: git init if not already a repo
    try {
      await this.exec(config.id, 'cd /workspace && [ -d .git ] || git init -q');
    } catch { /* non-fatal */ }

    return this.inspect(config.id);
  }

  /**
   * Execute a command inside the container and return the result.
   */
  async exec(projectId: string, command: string, cwd?: string): Promise<ExecResult> {
    const cid = this.getContainerId(projectId);
    const args = ['exec'];

    if (cwd) {
      args.push('-w', cwd);
    }

    args.push(cid, 'sh', '-c', command);

    try {
      const { stdout, stderr } = await execFileAsync(CONTAINER_BIN, args, {
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
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

  /**
   * Read a file from inside the container.
   */
  async readFile(projectId: string, filePath: string): Promise<string> {
    const result = await this.exec(projectId, `cat '${filePath.replace(/'/g, "'\\''")}'`);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read ${filePath}: ${result.stderr}`);
    }
    return result.stdout;
  }

  /**
   * Write a file inside the container.
   * Uses stdin piping — no shell argument limits, handles any content.
   */
  async writeFile(projectId: string, filePath: string, content: string): Promise<void> {
    const cid = this.getContainerId(projectId);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    const escapedPath = filePath.replace(/'/g, "'\\''");

    // Ensure parent directory exists
    await this.exec(projectId, `mkdir -p '${dir}'`);

    // Pipe content via stdin — avoids all shell escaping and argument length issues
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Timed out writing ${filePath}`));
      }, 30_000);

      const proc = spawn(CONTAINER_BIN, [
        'exec', '-i', cid, 'sh', '-c',
        `cat > '${escapedPath}'`,
      ]);

      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to write ${filePath}: ${err.message}`));
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to write ${filePath} (exit ${code}): ${stderr}`));
        }
      });

      proc.stdin.write(content, (err) => {
        if (err) {
          clearTimeout(timeout);
          reject(new Error(`Failed to write ${filePath}: ${err.message}`));
          return;
        }
        proc.stdin.end();
      });
    });
  }

  /**
   * List files in a directory inside the container.
   * Returns JSON array of {name, type, size} objects.
   */
  async listFiles(projectId: string, dirPath: string): Promise<Array<{ name: string; type: 'file' | 'directory'; size: number }>> {
    const result = await this.exec(
      projectId,
      `find '${dirPath.replace(/'/g, "'\\''") }' -maxdepth 1 -printf '%y\\t%s\\t%f\\n' 2>/dev/null | tail -n +2`
    );
    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [typeChar, sizeStr, ...nameParts] = line.split('\t');
        const name = nameParts.join('\t');
        return {
          name,
          type: typeChar === 'd' ? 'directory' as const : 'file' as const,
          size: parseInt(sizeStr, 10) || 0,
        };
      });
  }

  /**
   * Inspect a container and return its state.
   */
  async inspect(projectId: string): Promise<ContainerState> {
    const cid = this.getContainerId(projectId);

    try {
      const { stdout } = await execFileAsync(CONTAINER_BIN, ['inspect', cid]);
      const data = JSON.parse(stdout);
      const info = Array.isArray(data) ? data[0] : data;

      const config = info.configuration ?? {};
      const networks = info.networks ?? [];
      const ipAddress = networks[0]?.ipv4Address?.replace(/\/\d+$/, '');

      const publishedPorts = (config.publishedPorts ?? []).map((p: any) => ({
        host: p.hostPort,
        container: p.containerPort,
      }));

      return {
        id: cid,
        image: config.image?.reference ?? 'unknown',
        state: info.status === 'running' ? 'running' : 'stopped',
        ipAddress,
        cpus: config.resources?.cpus ?? 0,
        memoryBytes: config.resources?.memoryInBytes ?? 0,
        ports: publishedPorts,
      };
    } catch (err: any) {
      throw new Error(`Container ${cid} not found: ${err.message}`);
    }
  }

  /**
   * Stop a running container.
   */
  async stop(projectId: string): Promise<void> {
    const cid = this.getContainerId(projectId);
    try {
      await execFileAsync(CONTAINER_BIN, ['stop', cid], { timeout: 15_000 });
    } catch {
      // May already be stopped
    }
  }

  /**
   * Remove a container (force delete handles both running and stopped).
   */
  async remove(projectId: string): Promise<void> {
    const cid = this.getContainerId(projectId);
    try {
      await execFileAsync(CONTAINER_BIN, ['delete', '--force', cid], { timeout: 15_000 });
    } catch {
      // May already be removed
    }
    this.containers.delete(projectId);
  }

  /**
   * List all Sero-managed containers.
   */
  async list(): Promise<ContainerState[]> {
    try {
      const { stdout } = await execFileAsync(CONTAINER_BIN, ['list']);
      // Parse the CLI table output
      const lines = stdout.trim().split('\n').slice(1); // Skip header
      const states: ContainerState[] = [];

      for (const line of lines) {
        const parts = line.split(/\s{2,}/);
        if (parts.length < 2) continue;
        const id = parts[0].trim();
        if (!id.startsWith('sero-')) continue;

        const projectId = id.replace('sero-', '');
        try {
          states.push(await this.inspect(projectId));
        } catch {
          // Skip containers we can't inspect
        }
      }

      return states;
    } catch {
      return [];
    }
  }

  /**
   * Create an interactive terminal session via node-pty.
   * Uses a real PTY so `container exec -it` gets a proper terminal.
   */
  createTerminal(projectId: string, terminalId: string, cols = 80, rows = 24): IPty {
    const cid = this.getContainerId(projectId);

    // node-pty is a native module — require at runtime so esbuild doesn't try to bundle it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pty = require('node-pty') as typeof import('node-pty');

    // Electron may strip /usr/local/bin from PATH — ensure the container CLI is findable
    const env = { ...process.env } as Record<string, string>;
    if (env.PATH && !env.PATH.includes('/usr/local/bin')) {
      env.PATH = `/usr/local/bin:${env.PATH}`;
    }

    const proc = pty.spawn(CONTAINER_BIN, [
      'exec', '-it', '-w', '/workspace',
      '-e', 'TERM=xterm-256color',
      cid, '/bin/bash',
    ], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: process.env.HOME ?? '/tmp',
      env,
    });

    this.terminals.set(terminalId, proc);

    // Capture output into a ring buffer for agent visibility
    const outputBuffer = new TerminalOutputBuffer();
    this.terminalBuffers.set(terminalId, outputBuffer);

    // Track project → terminal mapping
    const existing = this.projectTerminals.get(projectId) ?? [];
    existing.push(terminalId);
    this.projectTerminals.set(projectId, existing);

    proc.onData((data: string) => {
      outputBuffer.append(data);
    });

    proc.onExit(() => {
      this.terminals.delete(terminalId);
      this.terminalBuffers.delete(terminalId);
      const ptList = this.projectTerminals.get(projectId);
      if (ptList) {
        const idx = ptList.indexOf(terminalId);
        if (idx !== -1) ptList.splice(idx, 1);
      }
      this.emit('terminal:exit', terminalId);
    });

    return proc;
  }

  /**
   * Get a terminal process by ID.
   */
  getTerminal(terminalId: string): IPty | undefined {
    return this.terminals.get(terminalId);
  }

  /**
   * Read recent output from a specific terminal.
   */
  readTerminalOutput(terminalId: string, lines = 100): string {
    const buf = this.terminalBuffers.get(terminalId);
    return buf ? buf.readLines(lines) : '';
  }

  /**
   * Read recent output from ALL terminals for a project.
   * Useful for the agent to see what's happening across all terminal sessions.
   */
  readProjectTerminalOutput(projectId: string, lines = 80): string {
    const terminalIds = this.projectTerminals.get(projectId) ?? [];
    if (terminalIds.length === 0) return '(no active terminals)';

    const sections: string[] = [];
    for (const tid of terminalIds) {
      const output = this.readTerminalOutput(tid, lines);
      if (output.trim()) {
        sections.push(`── Terminal ${tid} ──\n${output}`);
      }
    }
    return sections.join('\n\n') || '(no terminal output)';
  }

  /**
   * Dispose a terminal session.
   */
  disposeTerminal(terminalId: string): void {
    const proc = this.terminals.get(terminalId);
    if (proc) {
      proc.kill();
      this.terminals.delete(terminalId);
    }
  }

  /**
   * Dispose all terminals for a project.
   */
  disposeProjectTerminals(projectId: string): void {
    for (const [tid, proc] of this.terminals) {
      if (tid.startsWith(projectId)) {
        proc.kill();
        this.terminals.delete(tid);
      }
    }
  }

  /**
   * Dispose ALL terminals (used on app quit — containers stay running).
   */
  disposeAllTerminals(): void {
    for (const [tid, proc] of this.terminals) {
      proc.kill();
      this.terminals.delete(tid);
    }
    this.terminalBuffers.clear();
    this.projectTerminals.clear();
  }

  private getContainerId(projectId: string): string {
    const cid = this.containers.get(projectId) ?? this.containerId(projectId);
    return cid;
  }
}
