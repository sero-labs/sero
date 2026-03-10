/**
 * Retry queue with exponential backoff + continuation.
 *
 * Manages scheduled retries for failed/continuation agent runs.
 * Continuation retry: 1000ms fixed delay.
 * Failure retry: min(10000 * 2^(attempt-1), max_retry_backoff_ms).
 */

import type { RetryEntry, AgentConfig } from '../shared/types';
import { info, warn } from './logger';

// ── Types ──────────────────────────────────────────────────────

export interface RetryCallbacks {
  onRetryReady: (issueId: string, attempt: number) => void;
}

// ── Retry manager ──────────────────────────────────────────────

export class RetryManager {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private entries = new Map<string, RetryEntry>();
  private config: AgentConfig;
  private callbacks: RetryCallbacks;

  constructor(config: AgentConfig, callbacks: RetryCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /** Schedule a continuation retry (1s fixed delay). */
  scheduleContinuation(issueId: string, identifier: string, attempt: number): void {
    this.schedule(issueId, identifier, attempt, 1000, null);
  }

  /** Schedule a failure retry with exponential backoff. */
  scheduleRetry(
    issueId: string,
    identifier: string,
    attempt: number,
    error: string | null,
  ): void {
    if (attempt >= this.config.max_retries) {
      info('retry:max-attempts', { issueId, attempt, max: this.config.max_retries });
      return;
    }

    const delayMs = Math.min(
      10_000 * Math.pow(2, attempt - 1),
      this.config.max_retry_backoff_ms,
    );

    this.schedule(issueId, identifier, attempt + 1, delayMs, error);
  }

  /** Cancel any pending retry for an issue. */
  cancel(issueId: string): void {
    const timer = this.timers.get(issueId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(issueId);
    }
    this.entries.delete(issueId);
  }

  /** Cancel all pending retries. */
  cancelAll(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.entries.clear();
  }

  /** Get all current retry entries (for state snapshot). */
  getEntries(): RetryEntry[] {
    return Array.from(this.entries.values());
  }

  /** Check if an issue has a pending retry. */
  hasPending(issueId: string): boolean {
    return this.entries.has(issueId);
  }

  destroy(): void {
    this.cancelAll();
  }

  // ── Private ──────────────────────────────────────────────────

  private schedule(
    issueId: string,
    identifier: string,
    attempt: number,
    delayMs: number,
    error: string | null,
  ): void {
    // Cancel existing timer for this issue
    this.cancel(issueId);

    const dueAtMs = Date.now() + delayMs;

    const entry: RetryEntry = {
      issueId,
      identifier,
      attempt,
      dueAtMs,
      error,
    };

    this.entries.set(issueId, entry);

    const timer = setTimeout(() => {
      this.timers.delete(issueId);
      this.entries.delete(issueId);
      info('retry:firing', { issueId, attempt });
      this.callbacks.onRetryReady(issueId, attempt);
    }, delayMs);

    this.timers.set(issueId, timer);

    info('retry:scheduled', {
      issueId,
      identifier,
      attempt,
      delayMs,
      dueAt: new Date(dueAtMs).toISOString(),
    });
  }
}
