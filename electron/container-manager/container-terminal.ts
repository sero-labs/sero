/**
 * Terminal PTY management: create, read output, dispose terminals.
 */
import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';
import { CONTAINER_BIN, containerId } from './types';
import { TerminalOutputBuffer } from './terminal-buffer';

export class TerminalManager {
  // terminalId → node-pty instance
  private terminals = new Map<string, IPty>();
  // terminalId → output buffer (captures terminal output for agent visibility)
  private terminalBuffers = new Map<string, TerminalOutputBuffer>();
  // projectId → [terminalId, ...] mapping
  private projectTerminals = new Map<string, string[]>();

  constructor(
    private emitter: EventEmitter,
    private getContainerIdFn: (projectId: string) => string,
    private getEnvVarsFn: () => Record<string, string>,
  ) {}

  /**
   * Create an interactive terminal session via node-pty.
   * Uses a real PTY so `container exec -it` gets a proper terminal.
   */
  createTerminal(projectId: string, terminalId: string, cols = 80, rows = 24): IPty {
    const cid = this.getContainerIdFn(projectId);

    // node-pty is a native module — require at runtime so esbuild doesn't try to bundle it
    const pty = require('node-pty') as typeof import('node-pty');

    // Electron may strip /usr/local/bin from PATH
    const env = { ...process.env } as Record<string, string>;
    if (env.PATH && !env.PATH.includes('/usr/local/bin')) {
      env.PATH = `/usr/local/bin:${env.PATH}`;
    }

    // Build env flags for container exec
    const envFlags: string[] = ['-e', 'TERM=xterm-256color'];
    for (const [k, v] of Object.entries(this.getEnvVarsFn())) {
      envFlags.push('-e', `${k}=${v}`);
    }

    const proc = pty.spawn(CONTAINER_BIN, [
      'exec', '-it', '-w', '/workspace',
      ...envFlags,
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
      this.emitter.emit('terminal:exit', terminalId);
    });

    return proc;
  }

  /** Get a terminal process by ID. */
  getTerminal(terminalId: string): IPty | undefined {
    return this.terminals.get(terminalId);
  }

  /** Read recent output from a specific terminal. */
  readTerminalOutput(terminalId: string, lines = 100): string {
    const buf = this.terminalBuffers.get(terminalId);
    return buf ? buf.readLines(lines) : '';
  }

  /** Read recent output from ALL terminals for a project. */
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

  /** Dispose a terminal session. */
  disposeTerminal(terminalId: string): void {
    const proc = this.terminals.get(terminalId);
    if (proc) {
      proc.kill();
      this.terminals.delete(terminalId);
    }
  }

  /** Dispose all terminals for a project. */
  disposeProjectTerminals(projectId: string): void {
    for (const [tid, proc] of this.terminals) {
      if (tid.startsWith(projectId)) {
        proc.kill();
        this.terminals.delete(tid);
      }
    }
  }

  /** Dispose ALL terminals (used on app quit — containers stay running). */
  disposeAllTerminals(): void {
    for (const [tid, proc] of this.terminals) {
      proc.kill();
      this.terminals.delete(tid);
    }
    this.terminalBuffers.clear();
    this.projectTerminals.clear();
  }
}
