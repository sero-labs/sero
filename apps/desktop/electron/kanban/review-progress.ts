/**
 * ReviewProgressTracker — tracks live review activity for a card
 * and debounces writes to the state file for UI updates.
 *
 * Mirrors the planning/implementation progress tracker pattern.
 */

import type { Card, ReviewProgress, PlanningToolEntry } from './types';

const MAX_RECENT_TOOLS = 15;
const MAX_LOG_LINES = 20;
const PROGRESS_FLUSH_MS = 800;

type WriteCardFn = (stateFilePath: string, cardId: string, update: Partial<Card>) => Promise<void>;

export class ReviewProgressTracker {
  private progress: ReviewProgress;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    private readonly stateFilePath: string,
    private readonly cardId: string,
    private readonly writeCard: WriteCardFn,
  ) {
    this.progress = {
      phase: 'Starting review',
      startedAt: Date.now(),
      agents: [],
      recentTools: [],
      log: [],
    };
  }

  setPhase(phase: string): void {
    this.progress.phase = phase;
    this.scheduleDirtyFlush();
  }

  addAgent(name: string): void {
    this.progress.agents.push({ name, status: 'running' });
    this.scheduleDirtyFlush();
  }

  completeAgent(name: string, status: 'completed' | 'failed' = 'completed'): void {
    const agent = this.progress.agents.find(
      (a) => a.name === name && a.status === 'running',
    );
    if (agent) agent.status = status;
    this.scheduleDirtyFlush();
  }

  addLogLine(text: string): void {
    const toolMatch = text.match(/\s*\S+\s+(\w+):\s*(.+)/);
    if (toolMatch) {
      const [, tool, args] = toolMatch;
      for (const t of this.progress.recentTools) {
        if (t.running) t.running = false;
      }
      this.progress.recentTools.push({
        tool,
        args: args.slice(0, 120),
        running: true,
      });
      if (this.progress.recentTools.length > MAX_RECENT_TOOLS) {
        this.progress.recentTools = this.progress.recentTools.slice(-MAX_RECENT_TOOLS);
      }
    }

    this.progress.log.push(text.trim());
    if (this.progress.log.length > MAX_LOG_LINES) {
      this.progress.log = this.progress.log.slice(-MAX_LOG_LINES);
    }

    this.scheduleDirtyFlush();
  }

  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), PROGRESS_FLUSH_MS);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;

    try {
      await this.writeCard(this.stateFilePath, this.cardId, {
        reviewProgress: { ...this.progress },
      });
    } catch (err) {
      console.warn(`[kanban] Failed to flush review progress for card #${this.cardId}:`, err);
    }
  }

  async clear(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      await this.writeCard(this.stateFilePath, this.cardId, {
        reviewProgress: undefined,
      });
    } catch {
      // Best-effort cleanup
    }
  }
}
