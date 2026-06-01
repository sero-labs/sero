/**
 * ConcurrencyPool — manages global and per-call concurrency limits
 * plus abort cascading for subagent runs.
 */

interface Waiter {
  resolve: () => void;
}

interface SlotInfo {
  parentSessionId: string;
  controller: AbortController;
  callGroup?: string;
}

export class ConcurrencyPool {
  /** Global limit across all sessions. */
  private maxTotal: number;
  /** Per-invocation fan-out limit. */
  private maxConcurrent: number;

  /** Active slots keyed by slot key. */
  private active = new Map<string, SlotInfo>();
  /** Parent session → set of abort controllers. */
  private parentAbortMap = new Map<string, Set<AbortController>>();
  /** Per-call active counts keyed by call group. */
  private callCounts = new Map<string, number>();
  /** FIFO queue of waiters blocked on global capacity. */
  private waiters: Waiter[] = [];

  constructor(maxTotal = 8, maxConcurrent = 4) {
    this.maxTotal = maxTotal;
    this.maxConcurrent = maxConcurrent;
  }

  /** Update limits at runtime (e.g. from settings change). */
  updateLimits(maxTotal?: number, maxConcurrent?: number): void {
    if (maxTotal !== undefined) this.maxTotal = maxTotal;
    if (maxConcurrent !== undefined) this.maxConcurrent = maxConcurrent;
  }

  /** Current total active slots. */
  getActiveCount(): number {
    return this.active.size;
  }

  /**
   * Acquire a slot. Resolves when both global and per-call capacity
   * are available.
   *
   * @param key - Unique key for this slot (e.g. subagent run ID)
   * @param parentSessionId - Main session that spawned this subagent
   * @param controller - AbortController for cascade abort
   * @param callGroup - Optional group key for per-call limiting
   */
  async acquireSlot(
    key: string,
    parentSessionId: string,
    controller: AbortController,
    callGroup?: string,
  ): Promise<void> {
    const waitForCapacity = async (hasCapacity: () => boolean): Promise<void> => {
      if (hasCapacity()) return;
      await new Promise<void>((resolve) => {
        this.waiters.push({ resolve });
      });
      await waitForCapacity(hasCapacity);
    };

    // Wait for global capacity
    await waitForCapacity(() => this.active.size < this.maxTotal);

    // Wait for per-call capacity (if call group is specified)
    if (callGroup) {
      await waitForCapacity(() => (this.callCounts.get(callGroup) ?? 0) < this.maxConcurrent);
      this.callCounts.set(callGroup, (this.callCounts.get(callGroup) ?? 0) + 1);
    }

    // Register the slot
    this.active.set(key, { parentSessionId, controller, callGroup });

    // Track abort controller by parent session
    let controllers = this.parentAbortMap.get(parentSessionId);
    if (!controllers) {
      controllers = new Set();
      this.parentAbortMap.set(parentSessionId, controllers);
    }
    controllers.add(controller);
  }

  /**
   * Release a slot, freeing capacity for waiting acquirers.
   *
   * @param key - The slot key passed to acquireSlot
   * @param parentSessionId - The parent session ID
   * @param callGroup - Optional group key for per-call limiting
   */
  releaseSlot(key: string, parentSessionId: string, callGroup?: string): void {
    const info = this.active.get(key);
    if (!info) return; // Double-release is a no-op

    this.active.delete(key);

    // Decrement per-call count
    if (callGroup) {
      const count = this.callCounts.get(callGroup) ?? 0;
      if (count > 1) {
        this.callCounts.set(callGroup, count - 1);
      } else {
        this.callCounts.delete(callGroup);
      }
    }

    // Remove abort controller from parent map
    const controllers = this.parentAbortMap.get(parentSessionId);
    if (controllers) {
      controllers.delete(info.controller);
      if (controllers.size === 0) {
        this.parentAbortMap.delete(parentSessionId);
      }
    }

    // Wake up the next waiter(s)
    this.drainWaiters();
  }

  /**
   * Abort all running subagents for a parent session.
   * Already-completed (released) slots are unaffected.
   */
  abortAll(parentSessionId: string): void {
    const controllers = this.parentAbortMap.get(parentSessionId);
    if (!controllers) return;

    for (const controller of controllers) {
      try {
        controller.abort();
      } catch {
        // AbortController.abort() shouldn't throw, but be safe
      }
    }

    // Clean up: remove the aborted controllers, slots, and callCounts
    for (const [key, info] of this.active) {
      if (info.parentSessionId === parentSessionId) {
        this.active.delete(key);
        // Decrement per-call count for the slot's call group
        if (info.callGroup) {
          const count = this.callCounts.get(info.callGroup) ?? 0;
          if (count > 1) {
            this.callCounts.set(info.callGroup, count - 1);
          } else {
            this.callCounts.delete(info.callGroup);
          }
        }
      }
    }
    this.parentAbortMap.delete(parentSessionId);

    // Wake up waiters since slots were freed
    this.drainWaiters();
  }

  /**
   * Abort a single slot by key. Returns true if found and aborted.
   */
  abortOne(key: string): boolean {
    const info = this.active.get(key);
    if (!info) return false;

    try {
      info.controller.abort();
    } catch {
      // AbortController.abort() shouldn't throw, but be safe
    }

    // Clean up slot, callCounts, and parent map
    this.active.delete(key);
    if (info.callGroup) {
      const count = this.callCounts.get(info.callGroup) ?? 0;
      if (count > 1) {
        this.callCounts.set(info.callGroup, count - 1);
      } else {
        this.callCounts.delete(info.callGroup);
      }
    }
    const controllers = this.parentAbortMap.get(info.parentSessionId);
    if (controllers) {
      controllers.delete(info.controller);
      if (controllers.size === 0) {
        this.parentAbortMap.delete(info.parentSessionId);
      }
    }
    this.drainWaiters();
    return true;
  }

  /** Wake FIFO waiters as capacity becomes available. */
  private drainWaiters(): void {
    while (this.waiters.length > 0 && this.active.size < this.maxTotal) {
      const waiter = this.waiters.shift();
      waiter?.resolve();
    }
  }
}
