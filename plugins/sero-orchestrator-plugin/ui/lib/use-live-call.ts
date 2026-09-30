/**
 * The one-answer Orchestrator calls running now, as the runtime announces them.
 *
 * A wait the UI shows — a Room being designed, a Workflow planned for the first
 * time — may have no record the UI can read yet, so the runtime pushes each call
 * to this app's own views. Nothing is persisted.
 *
 * Calls are held in a map keyed by identity, not in one slot. Several can run at
 * once (two Workflows reflecting, a Room being designed while a Workflow checks
 * an event), and a single slot let the second call overwrite the first and the
 * first one's end clear the second.
 */

import { useState } from 'react';
import { useAppRuntimeEvents } from '@sero-ai/app-runtime';
// The key helper is a value, and shared/types.ts re-exports types only, so it
// comes from its own module.
import { liveCallKey } from '../../shared/live-call-types';
import type {
  LiveCallIdentity,
  LiveCallKind,
  LiveCallNotice,
  LiveCallUpdate,
} from '../../shared/types';

/** What a view is waiting for: a kind, and the identity it belongs to. */
export interface LiveCallMatch extends LiveCallIdentity {
  kind: LiveCallKind;
}

/** Every call running in this app, keyed by identity. */
function useLiveCalls(): Map<string, LiveCallNotice> {
  const [running, setRunning] = useState<Map<string, LiveCallNotice>>(new Map());

  useAppRuntimeEvents<LiveCallUpdate>('orchestrator-live-call', (update) => {
    if (!update || (update.status !== 'running' && update.status !== 'ended')) return;
    setRunning((current) => {
      const next = new Map(current);
      if (update.status === 'running') next.set(liveCallKey(update.call), update.call);
      else next.delete(liveCallKey(update.identity));
      return next;
    });
  });

  return running;
}

/**
 * The call a view is waiting on, or undefined.
 *
 * A match with no identity accepts any call of that kind, which is what a screen
 * that has no record yet needs (planning a brand-new Workflow, installing from
 * the Catalog). A match that names an identity takes only its own call.
 */
export function useLiveCall(match: LiveCallMatch | LiveCallKind): LiveCallNotice | undefined {
  const wanted: LiveCallMatch = typeof match === 'string' ? { kind: match } : match;
  const running = useLiveCalls();

  for (const call of running.values()) {
    if (call.kind !== wanted.kind) continue;
    if (wanted.loopId !== undefined && call.loopId !== wanted.loopId) continue;
    if (wanted.requestId !== undefined && call.requestId !== wanted.requestId) continue;
    if (wanted.roomId !== undefined && call.roomId !== wanted.roomId) continue;
    if (wanted.runId !== undefined && call.runId !== wanted.runId) continue;
    return call;
  }
  return undefined;
}

/** The run to watch for the call a view is waiting on, or undefined. */
export function useLiveCallRunId(match: LiveCallMatch | LiveCallKind): string | undefined {
  return useLiveCall(match)?.runId;
}
