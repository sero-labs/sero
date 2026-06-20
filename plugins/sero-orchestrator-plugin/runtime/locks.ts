// In-process execution gates (D-11). `host.appState.update` serializes file
// writes but cannot stop two attempts advancing one loop, so the coordinator
// holds these locks itself:
//   • LoopLocks — at most one in-flight attempt per loop id.
//   • Semaphore — caps concurrent attempts across all loops in a workspace.
// Both are deliberately synchronous: `tryAcquire` must settle before the first
// `await` in `run_next`, so two near-simultaneous requests cannot both pass.

export class LoopLocks {
  private readonly held = new Set<string>();

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

export class Semaphore {
  private inUse = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): boolean {
    if (this.inUse >= this.max) return false;
    this.inUse += 1;
    return true;
  }

  release(): void {
    if (this.inUse > 0) this.inUse -= 1;
  }

  get available(): number {
    return Math.max(0, this.max - this.inUse);
  }
}

/** Default cap on concurrent executing attempts per workspace (D-11). */
export const DEFAULT_WORKSPACE_CONCURRENCY = 2;
