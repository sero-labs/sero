import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useRef, useState } from 'react';

import { captureAndAttach, type FramesTarget } from '../lib/frames-upload';

/**
 * Capturing stills for videos that are waiting for them (D4).
 *
 * The runtime cannot decode video, so a clip generated while Sero was closed
 * arrives with no thumbnail and nothing the Librarian can look at, and stays
 * that way until an open app notices. This is what notices.
 *
 * One at a time, in the background, and quietly: this is repair work the user
 * did not ask for, and it must not compete with what they are actually doing.
 * The Library shows such an item as still analysing until the frames land,
 * which is true — analysis is held back until there is something to see.
 */

/** A target that has been tried and failed. Retried next time the app opens. */
type Attempted = Set<string>;

function keyOf(target: FramesTarget): string {
  return target.kind === 'item'
    ? `item:${target.itemId}`
    : `asset:${target.designId}:${target.assetId}`;
}

export interface VideoFramesState {
  /** Targets this session could not decode, so a caller can say so. */
  failed: string[];
}

export function useVideoFrames(targets: FramesTarget[]): VideoFramesState {
  const tools = useAppTools();
  const [failed, setFailed] = useState<string[]>([]);

  // Tried-in-this-session, so a clip the browser cannot decode is attempted once
  // rather than on every state change for as long as the app is open. Not
  // persisted: a new session is a new chance, and a codec can arrive with an
  // update.
  const attempted = useRef<Attempted>(new Set());
  const running = useRef(false);

  // The list is rebuilt on every state change, so the effect reads it through a
  // ref rather than depending on it — otherwise a single unrelated state write
  // would restart the sweep mid-capture.
  const latest = useRef(targets);
  useEffect(() => {
    latest.current = targets;
  });

  // One pass rather than map → filter → join: this runs on every render of a
  // surface that re-renders on every state write.
  const pendingKeys = targets.reduce((keys, target) => {
    const key = keyOf(target);
    return attempted.current.has(key) ? keys : `${keys}|${key}`;
  }, '');

  // The only state write below is guarded by `cancelled`, which this effect's
  // own cleanup sets — see the comment at the write.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    if (pendingKeys === '' || running.current) return;
    running.current = true;
    let cancelled = false;

    const sweep = async () => {
      // Re-read each time round: a capture takes seconds, and the set can grow
      // while one is in flight.
      for (;;) {
        if (cancelled) return;
        const next = latest.current.find((target) => !attempted.current.has(keyOf(target)));
        if (next === undefined) return;

        const key = keyOf(next);
        // Marked before the attempt, not after: a capture that throws must not
        // be picked up again immediately by the next pass.
        attempted.current.add(key);
        // One video at a time — decoding is expensive and this is background
        // repair, not something the user is waiting on.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const result = await captureAndAttach(tools, next).catch((error: unknown) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }));
        // Guarded by `cancelled`, which the cleanup below sets: the sweep
        // outlives an unmount because a capture takes seconds and the user can
        // leave the surface part-way through.
        if (!result.ok && !cancelled) setFailed((current) => [...current, key]);
      }
    };

    void sweep().finally(() => {
      running.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [pendingKeys, tools]);

  return { failed };
}
