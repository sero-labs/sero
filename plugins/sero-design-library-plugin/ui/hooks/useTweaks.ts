import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  DroppedTweak,
  TweakManifest,
  TweakOverrides,
  TweakValue,
} from '../../shared/tweaks';
import {
  TweakWriter,
  mergeOverrides,
  revertFailed,
  targetKey,
  unacknowledged,
  type PendingWrites,
  type TweakWriteTarget,
} from '../lib/tweak-writes';
import {
  EMPTY_MANIFEST,
  TWEAK_MANIFEST_FILE,
  editedTweakCount,
  effectiveTweakValue,
  normalizeTweakDocument,
  tweakCssBlock,
  tweakValueToCss,
} from '../../shared/tweaks';

/**
 * The tweaks panel's state (spec §6.5).
 *
 * Three things happen on every change, and they happen at different speeds. The
 * preview is updated immediately, because a control that lags is a control you
 * cannot judge. The panel shows the new value immediately, from a local overlay.
 * The value is persisted on a debounce, through the same request log as
 * everything else — the runtime stays the only writer, and dragging a slider does
 * not queue a write per frame.
 *
 * The overlay holds only what the runtime has not confirmed yet, so a change made
 * elsewhere is picked up as soon as it lands rather than being pinned out by a
 * stale local copy. `null` is how a reset travels through it: an absent key means
 * "no opinion", which is not the same as "no override".
 */

/** Long enough to coalesce a drag, short enough that a click feels saved. */
const PERSIST_MS = 250;

/** Where a tweak value belongs: one revision of one variant of one Design. */
export type TweakTargetRef = TweakWriteTarget;

export interface TweakSurface {
  manifest: TweakManifest;
  dropped: DroppedTweak[];
  loading: boolean;
  /** The value in force for each control, defaults included. */
  values: Record<string, TweakValue>;
  /** What the preview applies: custom property → value, ready for CSS. */
  cssValues: Record<string, string>;
  /** Controls carrying a value other than the one the design shipped with. */
  edited: Set<string>;
  editedCount: number;
  /** The effective block, for Copy CSS. */
  css: string;
  set(controlId: string, value: TweakValue): void;
  reset(controlId: string): void;
  resetAll(): void;
  /** End the editing session: one recoverable entry for everything since the last. */
  checkpoint(): void;
  /** Put an earlier session's values back; the current ones are kept first. */
  restoreCheckpoint(checkpointId: string): void;
}

export function useTweaks(
  target: TweakTargetRef | null,
  stored: TweakOverrides,
  hasManifest: boolean,
): TweakSurface {
  const tools = useAppTools();
  const key = targetKey(target);

  const [loaded, setLoaded] = useState<{
    key: string;
    manifest: TweakManifest;
    dropped: DroppedTweak[];
  }>({ key: '', manifest: EMPTY_MANIFEST, dropped: [] });
  const [pending, setPending] = useState<{ key: string; values: PendingWrites }>({ key, values: {} });

  // The manifest is a file, so reading it is a tool call — an external effect,
  // not derived state. A revision with no manifest never asks.
  useEffect(() => {
    if (target === null || !hasManifest) {
      setLoaded({ key, manifest: EMPTY_MANIFEST, dropped: [] });
      return;
    }
    let active = true;
    void tools
      .run('design_library_assets', {
        action: 'design-file',
        designId: target.designId,
        variantId: target.variantId,
        revisionId: target.revisionId,
        fileName: TWEAK_MANIFEST_FILE,
      })
      .then((result) => {
        if (!active) return;
        const block = result.content.find((entry) => entry.type === 'text');
        const text = block && 'text' in block ? String(block.text) : '';
        const document = normalizeTweakDocument(text === '' ? null : JSON.parse(text));
        setLoaded({ key, manifest: document.manifest, dropped: document.dropped });
      })
      .catch(() => {
        if (active) setLoaded({ key, manifest: EMPTY_MANIFEST, dropped: [] });
      });
    return () => {
      active = false;
    };
    // `key` stands in for the target, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasManifest, tools]);

  const manifest = loaded.key === key ? loaded.manifest : EMPTY_MANIFEST;
  const dropped = loaded.key === key ? loaded.dropped : [];
  /**
   * The overlay, filtered as it is read rather than pruned in an effect: an
   * entry the runtime has caught up with says nothing, and leaving it to a later
   * effect would show the old value for a paint — and, worse, mask a change made
   * anywhere else until that effect ran.
   */
  const outstanding = pending.key === key ? unacknowledged(pending.values, stored) : {};
  const overrides = mergeOverrides(stored, outstanding);
  const storedSignature = JSON.stringify(stored);

  // The write path — batching, targeting and ordering — lives in `TweakWriter`,
  // which is plain and testable. Built once: a new one each render would drop
  // whatever the last one was holding.
  const writer = useRef<TweakWriter | null>(null);
  writer.current ??= new TweakWriter(PERSIST_MS);
  const writes = writer.current;

  const send = useCallback(
    (params: Record<string, unknown>) => tools.run('design_library_designs', params),
    [tools],
  );

  /**
   * An action with nothing optimistic riding on it — a checkpoint, a reset, a
   * restore. The failure is swallowed here rather than left unhandled: what the
   * panel shows comes back from the record either way, and there is no local
   * value to take back.
   */
  const fire = useCallback(
    (writer: TweakWriter, params: Record<string, unknown>) => {
      void writer.send(send, params).catch(() => undefined);
    },
    [send],
  );

  /**
   * Which write currently owns each control's optimistic value.
   *
   * A failed write may finish long after the value it carried has been replaced,
   * and taking back "the value for this control" would then undo a correct one.
   * The counter says whether the failure is still the last word.
   */
  const writeCount = useRef(0);
  const owner = useRef<Record<string, number>>({});

  /**
   * Set a value optimistically, and take it back if the write fails — so a
   * control that could not be saved snaps back to what is stored rather than
   * showing a value nothing kept.
   */
  const put = useCallback(
    (controlId: string, value: TweakValue | null) => {
      if (target === null) return;
      const mine = (writeCount.current += 1);
      owner.current[controlId] = mine;
      setPending((current) => {
        const values = { ...(current.key === key ? current.values : {}) };
        // An overlay entry means "the runtime does not have this yet". A value
        // that already matches what is stored is not news, and keeping it would
        // mask the next change made anywhere else.
        if (value === null ? stored[controlId] === undefined : stored[controlId] === value) {
          delete values[controlId];
        } else {
          values[controlId] = value;
        }
        return { key, values };
      });
      writes.queue(send, target, controlId, value, () => {
        if (owner.current[controlId] !== mine) return;
        setPending((current) =>
          revertFailed(current, {
            key,
            controlId,
            attempted: value === null ? null : String(value),
          }),
        );
      });
    },
    [key, target, stored, writes, send],
  );

  /**
   * Leaving a revision ends the editing session on it (spec §6.5): what is
   * waiting is written first, to the revision it was set on, and the session is
   * then checkpointed as one recoverable entry.
   *
   * Here rather than only at the call sites that switch variant, because the
   * surface can change without any of them — moving to another Design from the
   * rail, or a revise landing a new revision.
   */
  useEffect(() => {
    const leaving = target;
    return () => {
      void writes.flush(send);
      if (leaving !== null) {
        fire(writes, { action: 'checkpoint-tweaks', ...leaving });
      }
    };
    // `key` stands in for the target it captures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, writes, send, fire]);

  /**
   * Drop an overlay entry the runtime has caught up with, for good.
   *
   * The read-time filter above hides it, which is enough for what is on screen;
   * this is about what happens *next*. An entry left in state stops matching the
   * moment anything else changes that control — the agent, another window — and
   * a value the user set minutes ago would come back over the change they are
   * looking at.
   */
  useEffect(() => {
    // The render reads `outstanding`, which is filtered above, so nothing stale
    // is ever painted by this — it only stops an acknowledged entry from being
    // resurrected by a later change.
    // react-doctor-disable-next-line react-doctor/no-adjust-state-on-prop-change
    setPending((current) => {
      if (current.key !== key) return current;
      const remaining = unacknowledged(current.values, stored);
      return remaining === current.values ? current : { key, values: remaining };
    });
    // `storedSignature` changes exactly when the persisted values do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, storedSignature]);

  const actions = useMemo(
    () => ({
      set(controlId: string, value: TweakValue) {
        put(controlId, value);
      },
      reset(controlId: string) {
        put(controlId, null);
      },
      resetAll() {
        // Written before it is undone. Reset all checkpoints what it clears, and
        // a value still sitting in the debounce would otherwise be absent from
        // the entry the user has to undo back to.
        void writes.flush(send);
        setPending({ key, values: {} });
        if (target !== null) fire(writes, { action: 'reset-tweaks', ...target });
      },
      checkpoint() {
        // After the values, never beside them: a checkpoint that overtook the
        // last change would close the session without it.
        void writes.flush(send);
        if (target !== null) fire(writes, { action: 'checkpoint-tweaks', ...target });
      },
      restoreCheckpoint(checkpointId: string) {
        // Same rule as Reset all: what is on screen is checkpointed before it is
        // replaced, so restoring is itself undoable.
        void writes.flush(send);
        setPending({ key, values: {} });
        if (target === null) return;
        fire(writes, { action: 'restore-tweaks', ...target, checkpointId });
      },
    }),
    [key, target, put, writes, send, fire],
  );

  const values: Record<string, TweakValue> = {};
  const cssValues: Record<string, string> = {};
  const edited = new Set<string>();
  for (const definition of manifest.controls) {
    const value = effectiveTweakValue(definition, overrides);
    values[definition.id] = value;
    cssValues[definition.cssVariable] = tweakValueToCss(definition.control, value);
    const override = overrides[definition.id];
    if (override !== undefined && override !== definition.defaultValue) edited.add(definition.id);
  }

  return {
    manifest,
    dropped,
    loading: hasManifest && loaded.key !== key,
    values,
    cssValues,
    edited,
    editedCount: editedTweakCount(manifest, overrides),
    css: tweakCssBlock(manifest, overrides),
    ...actions,
  };
}
