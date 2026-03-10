/**
 * Codex app-server subprocess client.
 *
 * Launches a Codex subprocess, communicates via JSON-RPC over stdio,
 * handles multi-turn loops, timeouts, and token accounting.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { CodexConfig } from '../shared/types';
import type { RunPhase } from '../shared/types';
import {
  createInitialize,
  createInitialized,
  createThreadStart,
  createTurnStart,
  createApprovalResponse,
  parseJsonRpcLine,
  extractTokenUsage,
  isTurnTerminal,
  isApprovalRequest,
  isUserInputRequired,
} from './agent-protocol';
import type { JsonRpcMessage, TokenUsage } from './agent-protocol';
import { info, warn, error as logError } from './logger';

// ── Types ──────────────────────────────────────────────────────

export interface AgentCallbacks {
  onPhaseChange: (phase: RunPhase) => void;
  onTokenUpdate: (usage: TokenUsage) => void;
  onMessage: (message: string) => void;
  onEvent: (event: string, timestamp: string) => void;
  onSessionStarted: (sessionId: string) => void;
  onTurnComplete: (turnNumber: number, result: 'completed' | 'failed' | 'cancelled') => void;
}

export interface AgentResult {
  success: boolean;
  turnCount: number;
  error: string | null;
  needsContinuation: boolean;
}

// ── Agent runner ───────────────────────────────────────────────

export class AgentRunner {
  private config: CodexConfig;
  private process: ChildProcess | null = null;
  private buffer = '';
  private threadId: string | null = null;
  private turnCount = 0;
  private aborted = false;

  constructor(config: CodexConfig) {
    this.config = config;
  }

  get pid(): string | null {
    return this.process?.pid ? String(this.process.pid) : null;
  }

  async run(
    prompt: string,
    workspaceCwd: string,
    callbacks: AgentCallbacks,
    turnNumber: number,
  ): Promise<AgentResult> {
    this.turnCount = turnNumber;
    this.aborted = false;

    callbacks.onPhaseChange('launching_agent');

    // Launch subprocess
    const proc = spawn('bash', ['-lc', this.config.command], {
      cwd: workspaceCwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CODEX_SYMPHONY: '1' },
    });

    this.process = proc;

    info('agent:launched', { pid: proc.pid, cwd: workspaceCwd });

    return new Promise<AgentResult>((resolve) => {
      let resolved = false;
      let lastEventTime = Date.now();
      let readTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
      let turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

      const finish = (result: AgentResult) => {
        if (resolved) return;
        resolved = true;
        clearTimers();
        resolve(result);
      };

      const clearTimers = () => {
        if (readTimeoutTimer) { clearTimeout(readTimeoutTimer); readTimeoutTimer = null; }
        if (turnTimeoutTimer) { clearTimeout(turnTimeoutTimer); turnTimeoutTimer = null; }
      };

      const resetReadTimeout = () => {
        if (readTimeoutTimer) clearTimeout(readTimeoutTimer);
        readTimeoutTimer = setTimeout(() => {
          warn('agent:read-timeout', { pid: proc.pid });
          this.kill();
          finish({ success: false, turnCount: this.turnCount, error: 'read_timeout', needsContinuation: false });
        }, this.config.read_timeout_ms);
      };

      // Turn timeout
      turnTimeoutTimer = setTimeout(() => {
        warn('agent:turn-timeout', { pid: proc.pid });
        this.kill();
        finish({ success: false, turnCount: this.turnCount, error: 'turn_timeout', needsContinuation: false });
      }, this.config.turn_timeout_ms);

      // Handle stdout (JSON-RPC messages)
      proc.stdout?.on('data', (chunk: Buffer) => {
        lastEventTime = Date.now();
        resetReadTimeout();
        this.buffer += chunk.toString();
        this.processBuffer(callbacks, finish, prompt);
      });

      // Handle stderr (diagnostics)
      proc.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) {
          info('agent:stderr', { pid: proc.pid, text: text.slice(0, 200) });
        }
      });

      // Handle process exit
      proc.on('close', (code) => {
        info('agent:exit', { pid: proc.pid, code });
        if (!resolved) {
          const success = code === 0;
          finish({
            success,
            turnCount: this.turnCount,
            error: success ? null : `exit_code_${code}`,
            needsContinuation: false,
          });
        }
      });

      proc.on('error', (err) => {
        logError('agent:spawn-error', { error: err.message });
        finish({ success: false, turnCount: this.turnCount, error: err.message, needsContinuation: false });
      });

      // Start handshake
      callbacks.onPhaseChange('initializing_session');
      this.send(createInitialize());
      resetReadTimeout();
    });
  }

  kill(): void {
    this.aborted = true;
    if (!this.process) return;

    const proc = this.process;
    info('agent:killing', { pid: proc.pid });

    try {
      proc.kill('SIGTERM');
    } catch {
      // process may already be dead
    }

    // Force kill after 5s
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, 5000);
  }

  // ── Private methods ──────────────────────────────────────────

  private send(message: JsonRpcMessage): void {
    if (!this.process?.stdin?.writable) return;
    try {
      this.process.stdin.write(JSON.stringify(message) + '\n');
    } catch (err) {
      warn('agent:send-error', { error: err instanceof Error ? err.message : String(err) });
    }
  }

  private processBuffer(
    callbacks: AgentCallbacks,
    finish: (result: AgentResult) => void,
    prompt: string,
  ): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? ''; // Keep incomplete last line

    for (const line of lines) {
      const msg = parseJsonRpcLine(line);
      if (!msg) continue;
      this.handleMessage(msg, callbacks, finish, prompt);
    }
  }

  private handleMessage(
    msg: JsonRpcMessage,
    callbacks: AgentCallbacks,
    finish: (result: AgentResult) => void,
    prompt: string,
  ): void {
    const now = new Date().toISOString();

    // Handle responses (to our requests)
    if ('id' in msg && 'result' in msg) {
      const result = msg.result as Record<string, unknown> | undefined;

      // Initialize response → send initialized + thread/start
      if (result && typeof result === 'object') {
        if (!this.threadId) {
          this.send(createInitialized());
          callbacks.onPhaseChange('streaming_turn');
          this.send(createThreadStart(prompt));
        }
      }
      return;
    }

    // Handle notifications
    if ('method' in msg && !('id' in msg)) {
      const method = msg.method;
      const params = (msg.params ?? {}) as Record<string, unknown>;

      callbacks.onEvent(method, now);

      // Session started
      if (method === 'session_started' || method === 'thread/started') {
        this.threadId = (params.threadId ?? params.sessionId ?? null) as string | null;
        if (this.threadId) callbacks.onSessionStarted(this.threadId);
        return;
      }

      // Token usage
      const tokens = extractTokenUsage(params);
      if (tokens) callbacks.onTokenUpdate(tokens);

      // Agent message
      if (method === 'agent/message') {
        const text = String(params.message ?? params.text ?? '');
        if (text) callbacks.onMessage(text.slice(0, 500));
      }

      // Approval request → auto-approve
      if (isApprovalRequest(method)) {
        const requestId = String(params.requestId ?? params.id ?? '');
        if (requestId) {
          this.send(createApprovalResponse(requestId, true));
          info('agent:auto-approved', { requestId });
        }
        return;
      }

      // User input required → fail
      if (isUserInputRequired(method)) {
        warn('agent:user-input-required');
        this.kill();
        finish({
          success: false,
          turnCount: this.turnCount,
          error: 'user_input_required',
          needsContinuation: false,
        });
        return;
      }

      // Turn terminal events
      if (isTurnTerminal(method)) {
        this.turnCount++;
        const result = method === 'turn/completed' ? 'completed'
          : method === 'turn/failed' ? 'failed' : 'cancelled';
        callbacks.onTurnComplete(this.turnCount, result);

        if (result === 'completed') {
          // Check if we need more turns
          if (this.turnCount < this.config.max_turns) {
            callbacks.onPhaseChange('finishing');
            finish({
              success: true,
              turnCount: this.turnCount,
              error: null,
              needsContinuation: this.turnCount < this.config.max_turns,
            });
          } else {
            callbacks.onPhaseChange('finishing');
            finish({
              success: true,
              turnCount: this.turnCount,
              error: null,
              needsContinuation: false,
            });
          }
        } else {
          callbacks.onPhaseChange('finishing');
          finish({
            success: false,
            turnCount: this.turnCount,
            error: `turn_${result}`,
            needsContinuation: false,
          });
        }
        return;
      }
    }
  }
}
