/**
 * SubagentTracker — real-time status tracking and event emission
 * for subagent runs.
 */

import { EventEmitter } from 'events';
import type { SubagentEntry, SubagentUsage, SubagentStatus, SubagentToolActivity } from './types';

const MAX_TOOLS = 10;
const MAX_LIVE_OUTPUT_CHARS = 20_000;
const MAX_TOOL_ARGS_CHARS = 1_000;

function truncateHead(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function truncateTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `…${text.slice(-Math.max(0, maxChars - 1))}`;
}

// ── Event Types ──────────────────────────────────────────────

export interface SubagentTrackerEvents {
  subagent_start: (entry: SubagentEntry) => void;
  subagent_progress: (id: string, usage: Partial<SubagentUsage>) => void;
  subagent_tool_activity: (id: string, activity: SubagentToolActivity[]) => void;
  subagent_live_output: (id: string, text: string) => void;
  subagent_end: (entry: SubagentEntry) => void;
  subagent_clear: (parentSessionId: string) => void;
}

export class SubagentTracker {
  private entries = new Map<string, SubagentEntry>();
  private emitter = new EventEmitter();

  constructor() {
    // Increase limit since parallel runs may have many listeners
    this.emitter.setMaxListeners(50);
  }

  // ── Event subscription ─────────────────────────────────────

  on<K extends keyof SubagentTrackerEvents>(
    event: K,
    listener: SubagentTrackerEvents[K],
  ): void {
    this.emitter.on(event, listener);
  }

  off<K extends keyof SubagentTrackerEvents>(
    event: K,
    listener: SubagentTrackerEvents[K],
  ): void {
    this.emitter.off(event, listener);
  }

  // ── Lifecycle methods ──────────────────────────────────────

  /** Register a new subagent run. */
  start(entry: SubagentEntry): void {
    this.entries.set(entry.id, { ...entry });
    this.emitter.emit('subagent_start', { ...entry });
  }

  /** Update usage stats during execution. */
  progress(id: string, partialUsage: Partial<SubagentUsage>): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    // Merge partial usage into existing
    if (partialUsage.inputTokens !== undefined) entry.usage.inputTokens = partialUsage.inputTokens;
    if (partialUsage.outputTokens !== undefined) entry.usage.outputTokens = partialUsage.outputTokens;
    if (partialUsage.cacheReadTokens !== undefined) entry.usage.cacheReadTokens = partialUsage.cacheReadTokens;
    if (partialUsage.cacheWriteTokens !== undefined) entry.usage.cacheWriteTokens = partialUsage.cacheWriteTokens;
    if (partialUsage.totalTokens !== undefined) entry.usage.totalTokens = partialUsage.totalTokens;
    if (partialUsage.cost !== undefined) entry.usage.cost = partialUsage.cost;

    this.emitter.emit('subagent_progress', id, { ...partialUsage });
  }

  /** Update tool activity (recent tool calls). */
  updateToolActivity(id: string, toolName: string, argsSummary: string, running: boolean): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    const safeArgsSummary = truncateHead(argsSummary, MAX_TOOL_ARGS_CHARS);
    if (running) {
      // Add new running tool
      entry.toolActivity.push({ toolName, argsSummary: safeArgsSummary, running: true });
      if (entry.toolActivity.length > MAX_TOOLS) {
        entry.toolActivity = entry.toolActivity.slice(-MAX_TOOLS);
      }
    } else {
      // Mark the last matching running tool as completed
      for (let i = entry.toolActivity.length - 1; i >= 0; i--) {
        if (entry.toolActivity[i].toolName === toolName && entry.toolActivity[i].running) {
          entry.toolActivity[i].running = false;
          break;
        }
      }
    }
    this.emitter.emit('subagent_tool_activity', id, [...entry.toolActivity]);
  }

  /** Append to live output text. */
  appendLiveOutput(id: string, delta: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.liveOutput = truncateTail(entry.liveOutput + delta, MAX_LIVE_OUTPUT_CHARS);
    // Only emit periodically — throttled in the IPC layer
    this.emitter.emit('subagent_live_output', id, entry.liveOutput);
  }

  /** Mark a run as completed with its response. */
  complete(id: string, response: string, usage: SubagentUsage): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    entry.status = 'completed';
    entry.completedAt = Date.now();
    entry.durationMs = entry.completedAt - entry.startedAt;
    entry.usage = { ...usage };
    entry.responsePreview = response.slice(0, 500);
    entry.fullResponse = response;

    this.emitter.emit('subagent_end', { ...entry });
  }

  /** Mark a run as failed. */
  fail(id: string, error: string, usage?: SubagentUsage): void {
    this.endWithStatus(id, 'failed', error, usage);
  }

  /** Mark a run as aborted. */
  abort(id: string): void {
    this.endWithStatus(id, 'aborted', 'Aborted by user');
  }

  /** Mark all running entries for a parent session as aborted. */
  abortByParentSession(parentSessionId: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.parentSessionId !== parentSessionId || entry.status !== 'running') {
        continue;
      }
      this.endWithStatus(id, 'aborted', 'Aborted by user');
    }
  }

  /** Mark a run as timed out. */
  timeout(id: string): void {
    const entry = this.entries.get(id);
    const durationInfo = entry
      ? ` after ${Math.round((Date.now() - entry.startedAt) / 1000)}s`
      : '';
    this.endWithStatus(id, 'timed_out', `Session timed out${durationInfo}`);
  }

  // ── Queries ────────────────────────────────────────────────

  /** Get all entries for a workspace (current snapshot). */
  snapshot(workspaceId: string): SubagentEntry[] {
    const result: SubagentEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.workspaceId === workspaceId) {
        result.push({ ...entry });
      }
    }
    return result;
  }

  /** Get a single entry by ID. */
  get(id: string): SubagentEntry | undefined {
    const entry = this.entries.get(id);
    return entry ? { ...entry } : undefined;
  }

  /** Remove all terminal entries for a workspace. */
  clearCompleted(workspaceId: string): void {
    const terminal: Set<SubagentStatus> = new Set(['completed', 'failed', 'aborted', 'timed_out']);
    for (const [id, entry] of this.entries) {
      if (entry.workspaceId === workspaceId && terminal.has(entry.status)) {
        this.entries.delete(id);
      }
    }
  }

  /** Remove all entries for a parent session. */
  clear(parentSessionId: string): void {
    for (const [id, entry] of this.entries) {
      if (entry.parentSessionId === parentSessionId) {
        this.entries.delete(id);
      }
    }
    this.emitter.emit('subagent_clear', parentSessionId);
  }

  // ── Internal ───────────────────────────────────────────────

  private endWithStatus(
    id: string,
    status: SubagentStatus,
    error: string,
    usage?: SubagentUsage,
  ): void {
    const entry = this.entries.get(id);
    if (!entry) return;

    entry.status = status;
    entry.completedAt = Date.now();
    entry.durationMs = entry.completedAt - entry.startedAt;
    entry.error = error;
    if (usage) entry.usage = { ...usage };

    this.emitter.emit('subagent_end', { ...entry });
  }
}
