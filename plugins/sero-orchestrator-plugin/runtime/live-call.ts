/**
 * The live-call mark: which one-answer Orchestrator call is running now.
 *
 * A call that returns one answer — the planner, a reflection, a stop-condition
 * check — shows its reply while it is written. The mark carries the call's
 * tracker run id so a view can open a live watch on the call it is waiting for.
 * It is written when the call starts and cleared when the call returns, however
 * it returns, so a stale mark can never outlive its call.
 */

import type { OrchestratorHost } from './host';
import type { LiveCall, LiveCallIdentity, LiveCallKind, LiveCallNotice, LoopRuntimeState } from '../shared/types';

/** Where a running call is recorded on the loop's runtime. */
export interface LiveCallTarget {
  loopId: string;
  kind: LiveCallKind;
  stepId?: string;
  label?: string;
}

function mapLoop(
  host: OrchestratorHost,
  loopId: string,
  change: (runtime: LoopRuntimeState) => LoopRuntimeState,
): Promise<void> {
  return host.updateState((state) => ({
    ...state,
    loops: state.loops.map((loop) =>
      loop.id === loopId
        ? { ...loop, runtime: change({ ...loop.runtime }) }
        : loop),
  }));
}

/** Record the call running now. */
export function markLiveCall(host: OrchestratorHost, target: LiveCallTarget, runId: string): Promise<void> {
  const call: LiveCall = {
    kind: target.kind,
    runId,
    ...(target.stepId ? { stepId: target.stepId } : {}),
    ...(target.label ? { label: target.label } : {}),
  };
  host.notifyLiveCall?.({ status: 'running', call: { ...call, loopId: target.loopId } });
  return mapLoop(host, target.loopId, (runtime) => ({ ...runtime, liveCall: call }));
}

/** Drop the mark. Nothing shows a live call for this loop until one marks it again. */
export function clearLiveCall(host: OrchestratorHost, loopId: string): Promise<void> {
  // Names its own call: a concurrent call in another Workflow must keep its view.
  host.notifyLiveCall?.({ status: 'ended', identity: { loopId } });
  return mapLoop(host, loopId, (runtime) => {
    if (!runtime.liveCall) return runtime;
    const { liveCall: _dropped, ...rest } = runtime;
    return rest;
  });
}

/** Tell the views a call started. Used by the paths with no loop runtime. */
export function announceLiveCall(host: OrchestratorHost, call: LiveCallNotice): void {
  host.notifyLiveCall?.({ status: 'running', call });
}

/** Tell the views one call ended, naming only that call. */
export function announceLiveCallEnded(host: OrchestratorHost, identity: LiveCallIdentity): void {
  host.notifyLiveCall?.({ status: 'ended', identity });
}
