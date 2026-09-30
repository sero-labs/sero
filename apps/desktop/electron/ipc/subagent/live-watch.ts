/**
 * Live watch bookkeeping for subagent streams.
 *
 * Each renderer window declares which runs it shows. `subagent_live_output`
 * and `subagent_tool_activity` go only to windows that watch that run, so the
 * main process stops sending data nobody can see.
 *
 * Kept free of Electron imports so the rules are unit-testable.
 */

/** Reference-counted watches, one set of run ids per renderer window. */
export class SubagentWatchRegistry {
  private readonly watches = new Map<number, Map<string, number>>();

  /** Register one more watch for `runId` from one window. */
  watch(webContentsId: number, runId: string): void {
    let perRun = this.watches.get(webContentsId);
    if (!perRun) {
      perRun = new Map();
      this.watches.set(webContentsId, perRun);
    }
    perRun.set(runId, (perRun.get(runId) ?? 0) + 1);
  }

  /** Release one watch. Extra releases are ignored. */
  unwatch(webContentsId: number, runId: string): void {
    const perRun = this.watches.get(webContentsId);
    if (!perRun) return;

    const count = perRun.get(runId) ?? 0;
    if (count <= 1) {
      perRun.delete(runId);
      if (perRun.size === 0) this.watches.delete(webContentsId);
      return;
    }
    perRun.set(runId, count - 1);
  }

  /** Every window that currently shows this run. */
  watchers(runId: string): number[] {
    const ids: number[] = [];
    for (const [webContentsId, perRun] of this.watches) {
      if (perRun.has(runId)) ids.push(webContentsId);
    }
    return ids;
  }

  /** Whether any window shows this run. */
  isWatched(runId: string): boolean {
    for (const perRun of this.watches.values()) {
      if (perRun.has(runId)) return true;
    }
    return false;
  }

  /** Drop every watch held by a window that no longer exists. */
  dropWindow(webContentsId: number): void {
    this.watches.delete(webContentsId);
  }

  /** Drop every watch on a run that has ended. */
  dropRun(runId: string): void {
    for (const [webContentsId, perRun] of this.watches) {
      perRun.delete(runId);
      if (perRun.size === 0) this.watches.delete(webContentsId);
    }
  }
}

/**
 * One timer and one pending payload per run id.
 *
 * A shared timer would let a busy run starve a quiet one. Each payload is the
 * whole capped tail, so a frame dropped by the rate limit loses nothing.
 */
export class PerRunThrottle<T> {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Map<string, T>();

  constructor(
    private readonly flush: (runId: string, payload: T) => void,
    private readonly intervalMs: number,
  ) {}

  /** Send now, or hold the payload as this run's next update. */
  push(runId: string, payload: T): void {
    if (this.timers.has(runId)) {
      this.pending.set(runId, payload);
      return;
    }
    this.flush(runId, payload);
    this.timers.set(
      runId,
      setTimeout(() => this.onTimer(runId), this.intervalMs),
    );
  }

  /** Forget a run's timer and held payload. Call when the run ends. */
  clear(runId: string): void {
    const timer = this.timers.get(runId);
    if (timer) clearTimeout(timer);
    this.timers.delete(runId);
    this.pending.delete(runId);
  }

  private onTimer(runId: string): void {
    this.timers.delete(runId);
    if (!this.pending.has(runId)) return;

    const payload = this.pending.get(runId) as T;
    this.pending.delete(runId);
    this.flush(runId, payload);
    this.timers.set(
      runId,
      setTimeout(() => this.onTimer(runId), this.intervalMs),
    );
  }
}
