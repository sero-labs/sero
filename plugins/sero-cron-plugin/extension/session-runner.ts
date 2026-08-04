/**
 * Transient session runner — creates in-memory AgentSession instances
 * for cron job execution, runs a single prompt, collects output, and
 * disposes the session.
 *
 * Key design decisions:
 * - Sessions are in-memory (SessionManager.inMemory()) — no files to clean up
 * - Concurrency is capped (default: 2) — prevents resource exhaustion
 * - Each job gets a fresh session — no cross-contamination between runs
 * - Timeout support with AbortController — prevents runaway sessions
 * - Re-entrancy guard — sessions skip loading cron extension to avoid loops
 */

import {
  createAgentSession,
  SessionManager,
} from '@earendil-works/pi-coding-agent';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import { info, error as logError } from './logger';

// ── Types ───────────────────────────────────────────────────────

export interface SessionRunOptions {
  /** Model string pattern (e.g. "sonnet", "openai/gpt-4o"). Omit for default. */
  model?: string;
  /** Working directory for tool execution. */
  cwd?: string;
  /** Maximum execution time in ms (default: 600_000 = 10 min). */
  timeoutMs?: number;
  /** Agent directory for auth/settings resolution. */
  agentDir?: string;
}

export interface SessionRunResult {
  output: string;
  exitCode: number;
  error?: string;
  durationMs: number;
}

// ── Concurrency pool ────────────────────────────────────────────

/** Maximum concurrent transient sessions. */
const DEFAULT_MAX_CONCURRENT = 2;

/** Active session set — tracks running job names for dedup + concurrency. */
const activeSessions = new Set<string>();

/** Queue of waiting jobs. */
const waitQueue: Array<{
  resolve: () => void;
  reject: (err: Error) => void;
  jobKey: string;
}> = [];

let maxConcurrent = DEFAULT_MAX_CONCURRENT;

/** Set the max concurrent sessions (for testing). */
export function setMaxConcurrent(n: number): void {
  maxConcurrent = Math.max(1, n);
}

/** Get the max concurrent sessions (for testing). */
export function getMaxConcurrent(): number {
  return maxConcurrent;
}

/** Get count of currently active sessions. */
export function getActiveCount(): number {
  return activeSessions.size;
}

/** Get names of active sessions. */
export function getActiveNames(): string[] {
  return [...activeSessions];
}

/**
 * Wait for a concurrency slot. Returns when a slot is available.
 * If the job key is already running, rejects immediately.
 */
function acquireSlot(jobKey: string): Promise<void> {
  if (activeSessions.has(jobKey)) {
    return Promise.reject(new Error(`Job "${jobKey}" is already running`));
  }

  if (activeSessions.size < maxConcurrent) {
    activeSessions.add(jobKey);
    return Promise.resolve();
  }

  // Queue and wait
  return new Promise<void>((resolve, reject) => {
    waitQueue.push({ resolve, reject, jobKey });
  });
}

/** Release a concurrency slot and wake the next waiter. */
function releaseSlot(jobKey: string): void {
  activeSessions.delete(jobKey);

  // Wake the next queued job that isn't already running
  while (waitQueue.length > 0 && activeSessions.size < maxConcurrent) {
    const next = waitQueue.shift()!;
    if (activeSessions.has(next.jobKey)) {
      // Reject — this job started via another path (shouldn't happen, but be safe)
      next.reject(new Error(`Job "${next.jobKey}" is already running`));
      continue;
    }
    activeSessions.add(next.jobKey);
    next.resolve();
    break;
  }
}

// ── Session execution ───────────────────────────────────────────

/**
 * Run a prompt in a transient in-memory session.
 *
 * Creates a fresh AgentSession, sends the prompt, waits for completion,
 * extracts the output, and disposes the session. No session files are
 * persisted to disk.
 */
export async function runTransientSession(
  jobKey: string,
  prompt: string,
  opts: SessionRunOptions = {},
): Promise<SessionRunResult> {
  const { cwd, model, timeoutMs = 600_000, agentDir } = opts;
  const startedAt = Date.now();

  // ── Acquire concurrency slot ────────────────────────────
  try {
    await acquireSlot(jobKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: '', exitCode: 1, error: msg, durationMs: 0 };
  }

  let session: AgentSession | null = null;

  try {
    info('session-runner:start', {
      jobKey,
      cwd: cwd ?? process.cwd(),
      timeoutMs,
      promptLen: prompt.length,
      concurrent: activeSessions.size,
    });

    // ── Set re-entrancy guard ───────────────────────────────
    // Prevent the cron extension from initializing a scheduler
    // inside the transient session.
    const prevEnv = process.env.SERO_CRON_SUBPROCESS;
    process.env.SERO_CRON_SUBPROCESS = '1';

    try {
      const sessionResult = await createAgentSession({
        cwd: cwd || process.cwd(),
        agentDir: agentDir || process.env.PI_CODING_AGENT_DIR || undefined,
        tools: ['read', 'bash', 'edit', 'write'],
        sessionManager: SessionManager.inMemory(cwd || process.cwd()),
      });
      session = sessionResult.session;
      await applyModelOverride(session, model);
    } finally {
      // Restore env — only clear if we set it
      if (prevEnv === undefined) {
        delete process.env.SERO_CRON_SUBPROCESS;
      } else {
        process.env.SERO_CRON_SUBPROCESS = prevEnv;
      }
    }

    // ── Run with timeout ──────────────────────────────────
    const output = await runWithTimeout(session, prompt, timeoutMs);
    const durationMs = Date.now() - startedAt;

    info('session-runner:complete', {
      jobKey,
      durationMs,
      outputLen: output.length,
    });

    return { output, exitCode: 0, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);

    logError('session-runner:failed', {
      jobKey,
      durationMs,
      error: message.slice(0, 500),
    });

    return {
      output: '',
      exitCode: 1,
      error: message.slice(0, 2000),
      durationMs,
    };
  } finally {
    // ── Dispose session ─────────────────────────────────────
    if (session) {
      try {
        session.dispose();
      } catch {
        // dispose must never throw out of finally
      }
    }
    releaseSlot(jobKey);
  }
}

// ── Model override resolution ───────────────────────────────────

async function applyModelOverride(
  session: AgentSession,
  modelOverride: string | undefined,
): Promise<void> {
  const normalized = modelOverride?.trim();
  if (!normalized || normalized === 'default') return;

  const model = findModelOverride(session, normalized);
  if (!model) {
    info('session-runner:model-override-not-found', { model: normalized });
    return;
  }

  await session.setModel(model);
}

function findModelOverride(
  session: AgentSession,
  modelOverride: string,
): Model<any> | undefined {
  const available = session.modelRegistry.getAvailable();
  const slashIndex = modelOverride.indexOf('/');

  if (slashIndex > 0) {
    const provider = modelOverride.slice(0, slashIndex);
    const modelId = modelOverride.slice(slashIndex + 1);
    return (
      session.modelRegistry.find(provider, modelId) ??
      available.find((model) => model.provider === provider && model.id === modelId)
    );
  }

  const lower = modelOverride.toLowerCase();
  return (
    available.find((model) => model.id === modelOverride) ??
    available.find((model) => model.id.toLowerCase() === lower) ??
    available.find((model) => model.name.toLowerCase() === lower) ??
    available.find(
      (model) =>
        model.id.toLowerCase().includes(lower) ||
        model.name.toLowerCase().includes(lower),
    )
  );
}

// ── Timeout wrapper ─────────────────────────────────────────────

async function runWithTimeout(
  session: AgentSession,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      session.abort();
      reject(new Error(`Session timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    await Promise.race([session.prompt(prompt), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  return extractOutput(session);
}

// ── Output extraction ───────────────────────────────────────────

/** Extract text output from the session's last assistant message. */
function extractOutput(session: AgentSession): string {
  const messages = session.messages;
  // Walk backwards to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text);
      if (textParts.length > 0) return textParts.join('\n');
    }
  }
  return '';
}
