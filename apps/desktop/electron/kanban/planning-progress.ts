/**
 * PlanningProgressTracker — tracks live planning activity for a single card
 * and debounces writes to the state file for UI updates (~1/sec).
 *
 * Extracted from orchestrator.ts for file size compliance.
 */

import type { Card, PlanningProgress, PlanningToolEntry } from './types';

const MAX_RECENT_TOOLS = 15;
const MAX_LOG_LINES = 20;
const PROGRESS_FLUSH_MS = 800;

type WriteCardFn = (stateFilePath: string, cardId: string, update: Partial<Card>) => Promise<void>;

export class PlanningProgressTracker {
  private progress: PlanningProgress;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(
    private readonly stateFilePath: string,
    private readonly cardId: string,
    private readonly writeCard: WriteCardFn,
  ) {
    this.progress = {
      phase: 'Analysing codebase',
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

  completeAgent(name: string): void {
    const agent = this.progress.agents.find((a) => a.name === name);
    if (agent) agent.status = 'completed';
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

  private scheduleDirtyFlush(): void {
    this.dirty = true;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), PROGRESS_FLUSH_MS);
    }
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
      await this.writeCard(this.stateFilePath, this.cardId, {
        planningProgress: { ...this.progress },
      });
    } catch (err) {
      console.warn(`[kanban] Failed to flush planning progress for card #${this.cardId}:`, err);
    }
  }

  /** Final cleanup — clear progress from card. */
  async clear(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      await this.writeCard(this.stateFilePath, this.cardId, {
        planningProgress: undefined,
      });
    } catch {
      // Best-effort cleanup
    }
  }
}
