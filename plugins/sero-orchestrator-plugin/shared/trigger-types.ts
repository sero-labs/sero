/**
 * Trigger shapes: the planner/extractor suggestion and the materialized
 * per-loop trigger. Split from types.ts to keep each file within the 500-LOC
 * limit; re-exported from types.ts so existing imports are unaffected.
 */

/** A planner/extractor-suggested trigger — no ids or counters yet (materializeTriggers mints those). */
export interface LoopTriggerSuggestion {
  type: 'manual' | 'cron' | 'event' | 'hybrid';
  schedule?: string;
  eventSource?: string;
  eventFilter?: Record<string, unknown>;
  /** Natural-language condition judged by a model call at fire time (never parsed by code). */
  eventCondition?: string;
  debounceMs?: number;
  maxFires?: number;
}

export interface LoopTrigger {
  id: string;
  loopId: string;
  workspaceId: string;
  type: 'manual' | 'cron' | 'event' | 'hybrid';
  schedule?: string;
  eventSource?: string;
  /**
   * Flat field predicates matched in code against the event payload's top-level
   * fields: strict equality, an array value means "payload value is one of".
   */
  eventFilter?: Record<string, unknown>;
  /** Natural-language condition judged by a model call at fire time (never parsed by code). */
  eventCondition?: string;
  debounceMs?: number;
  maxFires?: number;
  fireCount: number;
  lastFireAt?: string;
  nextFireAt?: string;
  /**
   * Fully off — nothing fires this trigger (loop disabled/complete, or maxFires
   * exhausted). Blocks BOTH the cron schedule and event matching.
   */
  disabled?: boolean;
  /**
   * Only the cron schedule is paused (user action, e.g. from the Scheduler app).
   * A hybrid trigger paused this way keeps firing on its events — unlike
   * `disabled`, this never touches event matching.
   */
  scheduleDisabled?: boolean;
}
