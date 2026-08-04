import type { TweakOverrides, TweakValue } from '../../shared/tweaks';

/**
 * Getting tweak values to the runtime in the right order, aimed at the right
 * revision.
 *
 * Kept out of the hook and out of React for the same reason `view-sync.ts` is:
 * the rules here are where the bugs live, and they are all about *time* —
 * a drag coalescing into one write, a write landing after the user has moved on,
 * a checkpoint overtaking the values it was meant to close over. None of that
 * needs a component to be true, and all of it needs testing.
 *
 * Three rules:
 *
 * 1. **A batch carries its target.** The revision a value belongs to is fixed
 *    when the value is set, not when the timer fires — those are hundreds of
 *    milliseconds apart, and long enough to change variant in.
 * 2. **Writes are chained.** Each request waits for the one before it, so the
 *    log receives them in the order they were made.
 * 3. **A checkpoint follows the values it closes over**, because it is sent
 *    through the same chain.
 */

export interface TweakWriteTarget {
  designId: string;
  variantId: string;
  revisionId: string;
}

/** A queued change. `null` is a reset — an absent key would mean "no opinion". */
export type PendingWrites = Record<string, TweakValue | null>;

export type SendRequest = (params: Record<string, unknown>) => Promise<unknown>;

export function targetKey(target: TweakWriteTarget | null): string {
  return target === null ? '' : `${target.designId}/${target.variantId}/${target.revisionId}`;
}

/** The persisted values with the not-yet-written ones on top. */
export function mergeOverrides(stored: TweakOverrides, pending: PendingWrites): TweakOverrides {
  const merged: TweakOverrides = { ...stored };
  for (const [id, value] of Object.entries(pending)) {
    if (value === null) delete merged[id];
    else merged[id] = value;
  }
  return merged;
}

/**
 * The pending entries still worth keeping: the ones the runtime has not caught
 * up with.
 *
 * An overlay that outlives the write that satisfied it is not merely redundant —
 * it masks the next change made anywhere else, so a value set by the agent, or
 * one the runtime declined, would never appear.
 */
export function unacknowledged(pending: PendingWrites, stored: TweakOverrides): PendingWrites {
  const remaining = Object.entries(pending).filter(([id, value]) =>
    value === null ? stored[id] !== undefined : stored[id] !== value,
  );
  return remaining.length === Object.keys(pending).length
    ? pending
    : Object.fromEntries(remaining);
}

/**
 * Undo one optimistic value after its write failed — but only if it is still the
 * value on screen.
 *
 * Reverting by control id alone is wrong in two ways that both end with a
 * correct value disappearing: a write that fails slowly can outlive the value
 * that replaced it, and one aimed at a revision the user has left has no
 * business touching the revision they are on now.
 */
export function revertFailed(
  pending: { key: string; values: PendingWrites },
  failed: { key: string; controlId: string; attempted: string | null },
): { key: string; values: PendingWrites } {
  if (pending.key !== failed.key) return pending;
  const held = pending.values[failed.controlId];
  if (held === undefined) return pending;
  // Values cross to the runtime as strings, so that is what "the same value"
  // means here too.
  const holding = held === null ? null : String(held);
  if (holding !== failed.attempted) return pending;
  const values = { ...pending.values };
  delete values[failed.controlId];
  return { key: pending.key, values };
}

/** What a queued change carries besides its value: what to do if it fails. */
interface QueuedWrite {
  value: TweakValue | null;
  onFailure?: () => void;
}

export class TweakWriter {
  private batch: { target: TweakWriteTarget; writes: Record<string, QueuedWrite> } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly delayMs: number) {}

  /**
   * Send through the chain, so requests arrive in the order they were made.
   *
   * The chain keeps a settled tail rather than the caller's promise: a rejected
   * `.then` is skipped by every `.then` after it, so one failed request would
   * silently stop this writer from ever sending anything again. The caller still
   * gets the real promise, rejection included.
   */
  send(send: SendRequest, params: Record<string, unknown>): Promise<unknown> {
    const sent = this.chain.then(() => send(params));
    this.chain = sent.then(
      () => undefined,
      () => undefined,
    );
    return sent;
  }

  /**
   * Hold a change for a moment, so a drag is one write rather than one per
   * frame. A change aimed at a different revision sends the waiting batch first,
   * whole and to its own target, rather than being merged into it.
   */
  queue(
    send: SendRequest,
    target: TweakWriteTarget,
    controlId: string,
    value: TweakValue | null,
    onFailure?: () => void,
  ): void {
    if (this.batch !== null && targetKey(this.batch.target) !== targetKey(target)) {
      void this.flush(send);
    }
    // A later change to the same control replaces the earlier one outright,
    // callback included: only the last value queued for a control is ever sent,
    // so only its caller has anything to undo.
    this.batch = {
      target,
      writes: {
        ...(this.batch?.writes ?? {}),
        [controlId]: onFailure === undefined ? { value } : { value, onFailure },
      },
    };
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(send), this.delayMs);
  }

  /** Write whatever is waiting. Resolves when every queued request has landed. */
  flush(send: SendRequest): Promise<unknown> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.batch;
    this.batch = null;
    if (batch === null) return this.chain;
    for (const [controlId, write] of Object.entries(batch.writes)) {
      void this.send(send, {
        ...(write.value === null
          ? { action: 'reset-tweak' }
          : { action: 'set-tweak', value: String(write.value) }),
        ...batch.target,
        controlId,
      }).catch(() => write.onFailure?.());
    }
    return this.chain;
  }

  /**
   * Drop what is waiting without writing it.
   *
   * Deliberately unused by the panel: every action that replaces the values
   * wholesale — Reset all, restoring a checkpoint — checkpoints what it
   * replaces, so a value still sitting in the debounce has to be written first
   * or the entry the user undoes back to is missing it. Kept for a caller that
   * genuinely wants the queue thrown away.
   */
  discard(): void {
    this.batch = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
