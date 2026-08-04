import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';

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

function keyOf(target: FramesTarget): string {
  // The attempt is part of the key: a retry produces new footage that needs
  // capturing again, and a key without it would look already-attempted.
  return target.kind === 'item'
    ? `item:${target.itemId}`
    : `asset:${target.designId}:${target.assetId}:${target.attemptId}`;
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
  const attempted = useRef<Set<string>>(new Set());
  const running = useRef(false);

  // The list is rebuilt on every state change, so the sweep reads it through a
  // ref rather than depending on it — otherwise an unrelated state write would
  // restart it mid-capture.
  const latest = useRef(targets);
  useEffect(() => {
    latest.current = targets;
  });

  // Unmount only. Deliberately NOT the sweep's cleanup: cancelling on every
  // change of the target list, and bailing out of the replacement because one
  // was still running, left a newly-retried video uncaptured for the rest of
  // the session. The sweep re-reads the list each time round, so it does not
  // need restarting — only stopping when there is no longer anyone to tell.
  const unmounted = useRef(false);
  useEffect(
    () => () => {
      unmounted.current = true;
    },
    [],
  );

  // The tool surface is read per capture rather than closed over. A sweep can
  // outlive several renders, and one holding the surface it started with would
  // keep calling a bridge that has since been replaced — marking every target it
  // touched as attempted, which is what stops them being tried again this
  // session.
  const toolsRef = useRef(tools);
  useEffect(() => {
    toolsRef.current = tools;
  });

  // A stable callback rather than a ref written during render: React may replay
  // or discard a render, and a runner assigned there could be one a committed
  // render never saw. Everything it touches is a ref, so it needs no deps at
  // all.
  const start = useCallback((): void => {
    if (running.current || unmounted.current) return;
    if (!latest.current.some((target) => !attempted.current.has(keyOf(target)))) return;
    running.current = true;

    const sweep = async () => {
      for (;;) {
        if (unmounted.current) return;
        const next = latest.current.find((target) => !attempted.current.has(keyOf(target)));
        if (next === undefined) return;

        const key = keyOf(next);
        // Marked before the attempt, not after: a capture that throws must not
        // be picked up again immediately by the next pass.
        attempted.current.add(key);
        // One video at a time — decoding is expensive and this is background
        // repair, not something the user is waiting on.
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const result = await captureAndAttach(toolsRef.current, next).catch((error: unknown) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }));
        if (!result.ok && !unmounted.current) setFailed((current) => [...current, key]);
      }
    };

    void sweep().finally(() => {
      running.current = false;
      // Checked again on the way out. A target that appeared while this sweep
      // was finishing has already had its render, and the effect below saw a
      // sweep running and left it alone — so without this the work would sit
      // there until something unrelated re-rendered.
      startRef.current();
    });
  }, []);

  // The runner restarts itself through a ref rather than by name, because a
  // callback cannot list itself as its own dependency.
  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const pendingKeys = targets.reduce((keys, target) => {
    const key = keyOf(target);
    return attempted.current.has(key) ? keys : `${keys}|${key}`;
  }, '');

  // The only state write is guarded by `unmounted`.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    start();
  }, [pendingKeys, start]);

  return { failed };
}
