/**
 * Terminal PTY management: create, read output, dispose terminals.
 * Each terminal is a `container exec -it` session via node-pty.
 */

import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';
import { CONTAINER_BIN, containerId } from './types';
import { TerminalOutputBuffer } from './terminal-buffer';

export class TerminalManager {
  /** terminalId → node-pty instance */
  private terminals = new Map<string, IPty>();
  /** terminalId → output buffer (for agent visibility) */
  private terminalBuffers = new Map<string, TerminalOutputBuffer>();
  /** workspaceId → [terminalId, ...] mapping */
  private workspaceTerminals = new Map<string, string[]>();

  constructor(
    private emitter: EventEmitter,
    private getContainerIdFn: (wsId: string) => string,
  ) {}

  /**
   * Create an interactive terminal session via node-pty.
   * Uses a real PTY so `container exec -it` gets a proper terminal.
   */
  createTerminal(workspaceId: string, terminalId: string, cols = 80, rows = 24): IPty {
    const cid = this.getContainerIdFn(workspaceId);

    // node-pty is a native module — require at runtime so esbuild doesn't bundle it
    const pty = require('node-pty') as typeof import('node-pty');

    // Electron may strip /usr/local/bin from PATH
    const env = { ...process.env } as Record<string, string>;
    if (env.PATH && !env.PATH.includes('/usr/local/bin')) {
      env.PATH = `/usr/local/bin:${env.PATH}`;
    }

    // Spawn bash directly — no intermediate sh -c wrapper.
    // Env vars (TERM, proxy, HOST) are set via /etc/profile.d/sero-env.sh
    // and /root/.bashrc, written during container creation.
    // NOTE: `container exec -it -e KEY=VAL` is broken (Apple CLI bug),
    // so we rely entirely on the profile scripts.
    const proc = pty.spawn(
      CONTAINER_BIN,
      ['exec', '-it', '-w', '/workspace', cid, '/bin/bash', '--login'],
      {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.env.HOME ?? '/tmp',
        env,
      },
    );

    this.terminals.set(terminalId, proc);

    // Capture output into a ring buffer for agent visibility
    const outputBuffer = new TerminalOutputBuffer();
    this.terminalBuffers.set(terminalId, outputBuffer);

    // Track workspace → terminal mapping
    const existing = this.workspaceTerminals.get(workspaceId) ?? [];
    existing.push(terminalId);
    this.workspaceTerminals.set(workspaceId, existing);

    proc.onData((data: string) => {
      outputBuffer.append(data);
    });

    proc.onExit(() => {
      this.terminals.delete(terminalId);
      this.terminalBuffers.delete(terminalId);
      const list = this.workspaceTerminals.get(workspaceId);
      if (list) {
        const idx = list.indexOf(terminalId);
        if (idx !== -1) list.splice(idx, 1);
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

  /** Read recent output from ALL terminals for a workspace. */
  readWorkspaceTerminalOutput(workspaceId: string, lines = 80): string {
    const terminalIds = this.workspaceTerminals.get(workspaceId) ?? [];
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

  /** Get the full raw output buffer for replay into xterm.js. */
  getReplayBuffer(terminalId: string): string {
    const buf = this.terminalBuffers.get(terminalId);
    return buf ? buf.read() : '';
  }

  /** Dispose a terminal session. */
  disposeTerminal(terminalId: string): void {
    const proc = this.terminals.get(terminalId);
    if (proc) {
      try {
        proc.kill();
      } catch {
        /* PTY may have already exited */
      }
      this.terminals.delete(terminalId);
      this.terminalBuffers.delete(terminalId);
    }
  }

  /** Dispose all terminals for a workspace. */
  disposeWorkspaceTerminals(workspaceId: string): void {
    const ids = this.workspaceTerminals.get(workspaceId) ?? [];
    for (const tid of [...ids]) {
      this.disposeTerminal(tid);
    }
    this.workspaceTerminals.delete(workspaceId);
  }

  /** Dispose ALL terminals (used on app quit). */
  disposeAllTerminals(): void {
    for (const [tid, proc] of this.terminals) {
      try {
        proc.kill();
      } catch {
        /* safe to ignore */
      }
    }
    this.terminals.clear();
    this.terminalBuffers.clear();
    this.workspaceTerminals.clear();
  }
}
