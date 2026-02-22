/**
 * Terminal PTY management: create, read output, dispose terminals.
 * Each terminal is a `container exec -it` session via node-pty.
 */

import type { IPty } from 'node-pty';
import { CONTAINER_BIN } from './types';
import { TerminalOutputBuffer } from './terminal-buffer';
import { loadNodePty } from '../lib/native-pty';

/** Callback invoked when a terminal process exits. */
export type TerminalExitCallback = (terminalId: string) => void;

export class TerminalManager {
  /** terminalId → node-pty instance */
  private terminals = new Map<string, IPty>();
  /** terminalId → output buffer (for agent visibility) */
  private terminalBuffers = new Map<string, TerminalOutputBuffer>();
  /** workspaceId → [terminalId, ...] mapping */
  private workspaceTerminals = new Map<string, string[]>();
  /** Registered exit callbacks. */
  private exitCallbacks: TerminalExitCallback[] = [];

  constructor(
    private getContainerIdFn: (wsId: string) => string,
  ) {}

  /** Register a callback for terminal exit events. */
  onTerminalExit(cb: TerminalExitCallback): void {
    this.exitCallbacks.push(cb);
  }

  /**
   * Create an interactive terminal session inside a container via node-pty.
   * Uses a real PTY so `container exec -it` gets a proper terminal.
   */
  createTerminal(workspaceId: string, terminalId: string, cols = 80, rows = 24): IPty {
    const cid = this.getContainerIdFn(workspaceId);

    const pty = loadNodePty();

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

    return this.registerTerminal(workspaceId, terminalId, proc);
  }

  /**
   * Create a host-side terminal session (no container).
   * Spawns a login shell directly on the host at the given cwd.
   */
  createHostTerminal(
    workspaceId: string,
    terminalId: string,
    cwd: string,
    cols = 80,
    rows = 24,
  ): IPty {
    const pty = loadNodePty();

    const env = { ...process.env } as Record<string, string>;
    if (env.PATH && !env.PATH.includes('/usr/local/bin')) {
      env.PATH = `/usr/local/bin:${env.PATH}`;
    }

    const shell = process.env.SHELL ?? '/bin/zsh';
    const proc = pty.spawn(shell, ['--login'], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
    });

    return this.registerTerminal(workspaceId, terminalId, proc);
  }

  /** Register a PTY process with tracking, buffers, and exit handling. */
  private registerTerminal(workspaceId: string, terminalId: string, proc: IPty): IPty {
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
      for (const cb of this.exitCallbacks) cb(terminalId);
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
    for (const [, proc] of this.terminals) {
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
