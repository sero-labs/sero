/**
 * BaseProgressTracker — shared logic for planning, implementation,
 * and review progress tracking.
 *
 * Handles debounced dirty-flush, tool parsing from onUpdate lines,
 * agent pill state, and log buffering. Subclasses only need to
 * provide initial progress state and the flush-to-card mapping.
 */

import type { Card, PlanningToolEntry } from './types';

const MAX_RECENT_TOOLS = 15;
const MAX_LOG_LINES = 20;
const PROGRESS_FLUSH_MS = 800;

export type WriteCardFn = (
  stateFilePath: string,
  cardId: string,
  update: Partial<Card>,
) => Promise<void>;

/** Minimal progress shape shared by all phases. */
export interface BaseProgress {
  phase: string;
  startedAt: number;
  agents: { name: string; status: 'running' | 'completed' | 'failed' }[];
  recentTools: PlanningToolEntry[];
  log: string[];
}

/**
 * Base class for kanban progress trackers.
 *
 * Subclasses must implement `buildCardUpdate()` to map their
 * specific progress shape to a `Partial<Card>` for flushing,
 * and `buildClearUpdate()` to clear progress on completion.
 */
export abstract class BaseProgressTracker<T extends BaseProgress> {
  protected progress: T;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    protected readonly stateFilePath: string,
    protected readonly cardId: string,
    protected readonly writeCard: WriteCardFn,
    initialProgress: T,
  ) {
    this.progress = initialProgress;
  }

  setPhase(phase: string): void {
    this.progress.phase = phase;
    this.onPhaseChange(phase);
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

  /** Parse an onUpdate line and extract tool info if present. */
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

  /** Write current progress to the card state file. */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;

    try {
      await this.writeCard(
        this.stateFilePath,
        this.cardId,
        this.buildCardUpdate(),
      );
    } catch (err) {
      console.warn(`[kanban] Failed to flush progress for card #${this.cardId}:`, err);
    }
  }

  /** Final cleanup — clear progress from card. */
  async clear(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      await this.writeCard(this.stateFilePath, this.cardId, this.buildClearUpdate());
    } catch {
      // Best-effort cleanup
    }
  }

  // ── Hooks for subclasses ──────────────────────────────────

  /** Called when setPhase() is invoked. Override for phase-specific logic. */
  protected onPhaseChange(_phase: string): void {
    // Default: no-op
  }

  /** Map current progress to a Partial<Card> for flushing. */
  protected abstract buildCardUpdate(): Partial<Card>;

  /** Map to a Partial<Card> that clears progress fields. */
  protected abstract buildClearUpdate(): Partial<Card>;

  // ── Private ───────────────────────────────────────────────

  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), PROGRESS_FLUSH_MS);
    }
  }
}
