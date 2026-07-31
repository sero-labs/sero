import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useRef, useState } from 'react';

import { attachClipFrames, clipKey, type ClipFramesTarget } from '../lib/clip-frames';

/**
 * Pulling frames out of clips that are waiting for them.
 *
 * The runtime has no codecs, so a clip finished while Sero was closed sits at
 * `awaiting-frames` until an open page notices. This is what notices.
 *
 * One clip at a time, and once per clip per session. Decoding sixty frames is
 * expensive and staging them is a few hundred tool calls, so two of these
 * running together would fight over the same bridge — and a clip the browser
 * cannot decode must be attempted once rather than on every state change for as
 * long as the app is open.
 */

export interface ClipFramesState {
  /** Clips this session could not decode, so a caller can say so. */
  failed: string[];
}

export function useClipFrames(targets: ClipFramesTarget[]): ClipFramesState {
  const tools = useAppTools();
  const [failed, setFailed] = useState<string[]>([]);

  // Not persisted: a new session is a new chance, and a codec can arrive with
  // an update.
  const attempted = useRef<Set<string>>(new Set());
  const running = useRef(false);

  // The list is rebuilt on every state change, so the sweep reads it through a
  // ref rather than depending on it — otherwise an unrelated write would
  // restart it mid-decode.
  const latest = useRef(targets);
  useEffect(() => {
    latest.current = targets;
  });

  // The tool surface is read per clip rather than closed over: a sweep outlives
  // several renders, and one holding a bridge that has since been replaced
  // would mark every clip it touched as attempted while achieving nothing.
  const toolsRef = useRef(tools);
  useEffect(() => {
    toolsRef.current = tools;
  });

  const unmounted = useRef(false);
  useEffect(
    () => () => {
      unmounted.current = true;
    },
    [],
  );

  const start = useCallback((): void => {
    if (running.current || unmounted.current) return;
    if (!latest.current.some((target) => !attempted.current.has(clipKey(target)))) return;
    running.current = true;

    const sweep = async () => {
      for (;;) {
        if (unmounted.current) return;
        const next = latest.current.find((target) => !attempted.current.has(clipKey(target)));
        if (next === undefined) return;

        const key = clipKey(next);
        // Marked before the attempt, not after: a decode that throws must not be
        // picked straight back up by the next pass round.
        attempted.current.add(key);
        // react-doctor-disable-next-line react-doctor/async-await-in-loop
        const result = await attachClipFrames(toolsRef.current, next).catch((error: unknown) => ({
          ok: false as const,
          error: error instanceof Error ? error.message : String(error),
        }));
        if (!result.ok && !unmounted.current) setFailed((current) => [...current, key]);
      }
    };

    void sweep().finally(() => {
      running.current = false;
      // Checked again on the way out: a clip that appeared while this sweep was
      // finishing has already had its render, and the effect below saw a sweep
      // running and left it alone.
      startRef.current();
    });
  }, []);

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const pending = targets.reduce((keys, target) => {
    const key = clipKey(target);
    return attempted.current.has(key) ? keys : `${keys}|${key}`;
  }, '');

  // The only state write is guarded by `unmounted`.
  // react-doctor-disable-next-line react-doctor/no-set-state-after-await-in-effect
  useEffect(() => {
    start();
  }, [pending, start]);

  return { failed };
}
