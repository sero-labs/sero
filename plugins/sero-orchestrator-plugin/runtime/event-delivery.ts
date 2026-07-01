/**
 * Event broadcast + delivery (Living Loops, spec 12). Split out of
 * coordinator.ts (500-LOC limit); the coordinator remains the only caller and
 * the only component that starts runs — these functions reach back into it
 * through the narrow `CoordinatorRunSeam`.
 *
 * Delivery semantics: matching per trigger is exact source, structured filter,
 * and debounce in code, then the optional natural-language condition as a model
 * call (last, so the code checks bound the model-call volume). A due idle loop
 * starts a fresh iteration seeded with the event; a busy loop stashes it
 * latest-wins for the iteration that follows. Every fire increments fireCount.
 */

import type { Loop, LoopWarning, OrchestratorActionResult, OrchestratorEvent } from '../shared/types';
import type { OrchestratorHost } from './host';
import { applyEventFires, rearmLoop } from './scheduler';
import { codeMatchEventTrigger, EVENT_CHAIN_DEPTH_LIMIT, RECENT_EVENT_KEYS_LIMIT } from './event-match';
import { evaluateEventCondition } from './event-condition';

/** The coordinator internals event delivery needs — nothing else mutates runs. */
export interface CoordinatorRunSeam {
  /** True when the coordinator holds an in-flight run handle for the loop. */
  isRunning(loopId: string): boolean;
  findLoop(loopId: string): Promise<Loop | undefined>;
  replaceLoop(loop: Loop): Promise<void>;
  runNext(loopId: string, known?: Loop): Promise<OrchestratorActionResult>;
}

/** Broadcasts one event to every active loop with a matching trigger. */
export async function broadcastEvent(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  event: OrchestratorEvent,
): Promise<void> {
  if (await alreadyDelivered(host, event)) return;
  const state = await host.readState();
  if (!state) return;
  const nowMs = Date.parse(host.now());
  for (const loop of state.loops) {
    if (loop.status !== 'active') continue;
    // A loop's own events never fire its own triggers.
    if (event.sourceLoopId === loop.id) continue;
    const candidates = loop.triggers.filter((t) => codeMatchEventTrigger(t, event, nowMs) === 'match');
    if (candidates.length === 0) continue;
    // Cycle guard: a fire caused by a deep loop→loop chain is dropped visibly.
    if ((event.chainDepth ?? 0) >= EVENT_CHAIN_DEPTH_LIMIT) {
      await recordChainDepthWarning(host, loop.id, event);
      continue;
    }
    const passing: string[] = [];
    for (const trigger of candidates) {
      if (trigger.eventCondition) {
        const matches = await evaluateEventCondition(host, loop, trigger, event).catch((error) => {
          // An evaluation failure never crashes the broadcast and never counts as a match.
          host.log(`Event condition for loop ${loop.id} trigger ${trigger.id} failed: ${error}`);
          return false;
        });
        if (!matches) continue;
      }
      passing.push(trigger.id);
    }
    if (passing.length > 0) await deliverEventFire(host, seam, loop.id, passing, event);
  }
}

/**
 * Consumes a stashed pending event once the loop is idle: clears the stash and
 * runs a fresh event pass seeded with it. Each drained pass goes back through
 * runNext, so a NEW event arriving during that pass stashes again and drains in
 * turn — the chain ends when no new event arrived.
 */
export async function drainPendingEvent(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
): Promise<void> {
  const loop = await seam.findLoop(loopId);
  if (!loop || loop.status !== 'active' || !loop.runtime.pendingEvent) return;
  if (loop.runtime.activeRunId || seam.isRunning(loopId) || loop.runtime.pendingInput) return;
  const event = loop.runtime.pendingEvent;
  const cleared: Loop = { ...loop, runtime: { ...loop.runtime, pendingEvent: undefined } };
  await seam.replaceLoop(cleared);
  await runEventPass(host, seam, cleared, event);
}

/** Restart-safe dedupe: an event carrying a dedupeKey is delivered at most once. */
async function alreadyDelivered(host: OrchestratorHost, event: OrchestratorEvent): Promise<boolean> {
  if (!event.dedupeKey) return false;
  const key = `${event.source}#${event.dedupeKey}`;
  let seen = false;
  await host.updateState((state) => {
    const recent = state.recentEventKeys ?? [];
    if (recent.includes(key)) {
      seen = true;
      return state;
    }
    return { ...state, recentEventKeys: [...recent, key].slice(-RECENT_EVENT_KEYS_LIMIT) };
  });
  return seen;
}

/** One visible warning (replacing the prior one) when a loop→loop chain hits the depth cap. */
async function recordChainDepthWarning(
  host: OrchestratorHost,
  loopId: string,
  event: OrchestratorEvent,
): Promise<void> {
  const warning: LoopWarning = {
    id: host.newId('warning'),
    code: 'event-chain-depth',
    message: `Dropped event "${event.source}" — the loop→loop trigger chain reached ${EVENT_CHAIN_DEPTH_LIMIT} hops (possible cycle).`,
    createdAt: host.now(),
  };
  await host.updateState((state) => ({
    ...state,
    loops: state.loops.map((l) =>
      l.id === loopId ? { ...l, warnings: [...l.warnings.filter((w) => w.code !== warning.code), warning] } : l,
    ),
  }));
  host.log(warning.message);
}

/**
 * Records the fires and either starts a fresh pass (idle) or stashes the event
 * latest-wins (run in flight / parked on a question). The code match is
 * re-checked inside the state update — the condition calls above take time, and
 * another event may have debounced or exhausted a trigger meanwhile.
 */
async function deliverEventFire(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
  triggerIds: string[],
  event: OrchestratorEvent,
): Promise<void> {
  const wanted = new Set(triggerIds);
  let fired: Loop | undefined;
  let busy = false;
  await host.updateState((state) => {
    const index = state.loops.findIndex((l) => l.id === loopId);
    if (index === -1) return state;
    const current = state.loops[index];
    if (current.status !== 'active') return state;
    const nowMs = Date.parse(host.now());
    const firing = current.triggers
      .filter((t) => wanted.has(t.id) && codeMatchEventTrigger(t, event, nowMs) === 'match')
      .map((t) => t.id);
    if (firing.length === 0) return state;
    busy = Boolean(current.runtime.activeRunId) || seam.isRunning(loopId) || Boolean(current.runtime.pendingInput);
    let next = applyEventFires(current, firing, nowMs);
    if (busy) next = { ...next, runtime: { ...next.runtime, pendingEvent: event } };
    fired = next;
    const loops = [...state.loops];
    loops[index] = next;
    return { ...state, loops };
  });
  if (!fired || busy) return;
  await runEventPass(host, seam, fired, event);
}

/**
 * Starts a fresh event-fired iteration (cron semantics): drops the previous
 * iteration's worktree, re-arms the plan, and seeds the firing event — the
 * engine consumes it into the run's `firedBy` and an `event` observation.
 */
async function runEventPass(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loop: Loop,
  event: OrchestratorEvent,
): Promise<void> {
  const prior = loop.runtime.workspace.resolved;
  if (prior?.type === 'managed-worktree') {
    await host.removeWorktree(prior.worktreeKey ?? loop.id, { force: true });
  }
  const rearmed = rearmLoop(loop, host.now());
  const seeded: Loop = { ...rearmed, runtime: { ...rearmed.runtime, pendingEvent: event } };
  await seam.replaceLoop(seeded);
  await seam.runNext(loop.id, seeded);
}
