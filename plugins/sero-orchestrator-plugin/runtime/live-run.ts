/**
 * The live-run mark: the one signal that says a run is attached and reporting
 * to THIS Sero session.
 *
 * `status` and `activeRunId` are durable, so they outlive the process that set
 * them: after a crash a loop can still read "active, running" with nothing
 * behind it. The mark is written only while the engine commits a run's state,
 * and startup reconciliation clears whatever an earlier session left, so a
 * reader that sees a mark reported since its own session began knows work is
 * really happening. Readers decide with `isLive` from `@sero-ai/common`.
 */

import type { LiveRunMark } from '@sero-ai/common';
import type { Loop } from '../shared/types';

/** Stamps the mark from the loop's own active run, or clears it when no run is active. */
export function stampLiveRun(loop: Loop, now: string): Loop {
  const runId = loop.runtime.activeRunId;
  if (!runId) return clearLiveRun(loop);
  const existing = loop.runtime.liveRun;
  if (existing?.runId === runId && existing.reportedAt === now) return loop;
  const mark: LiveRunMark =
    existing?.runId === runId
      ? { ...existing, reportedAt: now }
      : { runId, startedAt: now, reportedAt: now };
  return { ...loop, runtime: { ...loop.runtime, liveRun: mark } };
}

/** Drops the mark. Nothing reports for this loop until a run stamps it again. */
export function clearLiveRun(loop: Loop): Loop {
  if (!loop.runtime.liveRun) return loop;
  const { liveRun: _dropped, ...runtime } = loop.runtime;
  return { ...loop, runtime };
}
