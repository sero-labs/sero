/**
 * Per-loop run lock (D-10). Only one coordinator run may advance a loop at a
 * time. This is a non-blocking try-lock: when the lock is held the caller sets
 * `runtime.dueAgain` and returns instead of queueing a second run.
 */

export class LoopLocks {
  private readonly held = new Set<string>();

  /** Acquires the lock for a loop. Returns false if it is already held. */
  tryAcquire(loopId: string): boolean {
    if (this.held.has(loopId)) return false;
    this.held.add(loopId);
    return true;
  }

  release(loopId: string): void {
    this.held.delete(loopId);
  }

  isHeld(loopId: string): boolean {
    return this.held.has(loopId);
  }
}
