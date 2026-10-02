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
/** Whether a running call is the one a view asked for. */
function matchesIdentity(call: LiveCallIdentity, wanted: LiveCallIdentity): boolean {
  if (call.kind !== wanted.kind) return false;
  if (wanted.loopId !== undefined && call.loopId !== wanted.loopId) return false;
  if (wanted.requestId !== undefined && call.requestId !== wanted.requestId) return false;
  if (wanted.roomId !== undefined && call.roomId !== wanted.roomId) return false;
  if (wanted.runId !== undefined && call.runId !== wanted.runId) return false;
  return true;
}

export function useLiveCall(match: LiveCallIdentity | LiveCallKind): LiveCallNotice | undefined {
  const wanted: LiveCallIdentity = typeof match === 'string' ? { kind: match } : match;
  const running = useLiveCalls();

  for (const call of running.values()) {
    if (matchesIdentity(call, wanted)) return call;
  }
  return undefined;
}

/** The run to watch for the call a view is waiting on, or undefined. */
export function useLiveCallRunId(match: LiveCallIdentity | LiveCallKind): string | undefined {
  return useLiveCall(match)?.runId;
}
