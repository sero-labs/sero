/**
 * The one-answer Orchestrator call running now, as the runtime announces it.
 *
 * A wait the UI shows — a Room being designed, a Workflow planned for the first
 * time — may have no record the UI can read yet, so the runtime pushes the
 * running call to this app's own views. Nothing is persisted, and a view that
 * subscribes after the call started still sees the current one.
 */

import { useState } from 'react';
import { useAppRuntimeEvents } from '@sero-ai/app-runtime';
import type { LiveCallNotice } from '../../shared/types';

/** The running call, or null when nothing is running. */
export function useLiveCallNotice(): LiveCallNotice | null {
  const [notice, setNotice] = useState<LiveCallNotice | null>(null);

  useAppRuntimeEvents<LiveCallNotice | null>('orchestrator-live-call', (payload) => {
    setNotice(payload ?? null);
  });

  return notice;
}

/** The run to watch while that kind of call runs, or undefined. */
export function useLiveCallRunId(kind: LiveCallNotice['kind']): string | undefined {
  const notice = useLiveCallNotice();
  return notice && notice.kind === kind ? notice.runId : undefined;
}
