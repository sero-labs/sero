/**
 * Event broadcast + delivery (Living Loops, spec 12). Split out of
 * coordinator.ts (500-LOC limit); the coordinator remains the only caller and
 * the only component that starts runs — these functions reach back into it
 * through the narrow `CoordinatorRunSeam`.
 *
 * Delivery semantics: matching per trigger is exact source, structured filter,
 * and debounce in code, then the optional natural-language condition as a model
 * call (last, so the code checks bound the model-call volume). Every accepted
 * fire is APPENDED to the loop's pending-event FIFO (spec 15 — the spec-12
 * latest-wins stash silently dropped discrete per-PR events); an idle loop
 * additionally starts a fresh pass, and the engine consumes the queue HEAD at
 * run start. Every fire increments fireCount.
 */

import type { Loop, LoopWarning, OrchestratorActionResult, OrchestratorEvent } from '../shared/types';
import type { OrchestratorHost } from './host';
import { applyEventFires, rearmLoop } from './scheduler';
import { codeMatchEventTrigger, EVENT_CHAIN_DEPTH_LIMIT, RECENT_EVENT_KEYS_LIMIT } from './event-match';
import { evaluateEventCondition } from './event-condition';
import { enqueuePendingEvent } from './event-queue';

/** The coordinator internals event delivery needs — nothing else mutates runs. */
export interface CoordinatorRunSeam {
  /** True when the coordinator holds an in-flight run handle for the loop. */
  isRunning(loopId: string): boolean;
  findLoop(loopId: string): Promise<Loop | undefined>;
  replaceLoop(loop: Loop): Promise<void>;
  runNext(loopId: string, known?: Loop): Promise<OrchestratorActionResult>;
}

/** Outcome of one broadcast — lets callers distinguish "nobody listened" from "dropped as duplicate". */
export interface EventBroadcast {
  /** How many loops accepted a fire (0 ⇒ nothing subscribed/matched). */
  delivered: number;
  /** The event's dedupeKey was already delivered, so the broadcast was dropped. */
  deduped: boolean;
}

/**
 * Broadcasts one event to every active loop with a matching trigger.
 * Callers like the Agent Board's "Start work" use the outcome to tell the user
 * when an event landed nowhere versus when it was a duplicate.
 */
export async function broadcastEvent(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  event: OrchestratorEvent,
): Promise<EventBroadcast> {
  if (await alreadyDelivered(host, event)) return { delivered: 0, deduped: true };
  const state = await host.readState();
  if (!state) return { delivered: 0, deduped: false };
  let delivered = 0;
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
    if (passing.length > 0) {
      await deliverEventFire(host, seam, loop.id, passing, event);
      delivered += 1;
    }
  }
  return { delivered, deduped: false };
}

/**
 * Starts the next queued iteration once the loop is idle. The queue rides in
 * `runtime.pendingEvents` through the re-arm; the engine consumes the HEAD at
 * run start. Each drained pass goes back through runNext, so events arriving
 * during a pass queue behind and drain in turn — the chain ends when the
 * queue is empty.
 */
export async function drainPendingEvent(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
): Promise<void> {
  const loop = await seam.findLoop(loopId);
  if (!loop || loop.status !== 'active' || !loop.runtime.pendingEvents?.length) return;
  if (loop.runtime.activeRunId || seam.isRunning(loopId) || loop.runtime.pendingInput || isSnoozed(loop, host.now())) return;
  await runEventPass(host, seam, loopId);
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
 * Records the fires and appends the event to the loop's pending FIFO; an idle
 * loop additionally starts the next pass. The code match is re-checked inside
 * the state update — the condition calls above take time, and another event
 * may have debounced or exhausted a trigger meanwhile.
 */
async function deliverEventFire(
  host: OrchestratorHost,
  seam: CoordinatorRunSeam,
  loopId: string,
  triggerIds: string[],
  event: OrchestratorEvent,
): Promise<void> {
  const wanted = new Set(triggerIds);
  let fired = false;
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
    busy = Boolean(current.runtime.activeRunId)
      || seam.isRunning(loopId)
      || Boolean(current.runtime.pendingInput)
      || isSnoozed(current, host.now());
    const next = enqueuePendingEvent(host, applyEventFires(current, firing, nowMs), event);
    fired = true;
    const loops = [...state.loops];
    loops[index] = next;
    return { ...state, loops };
  });
  if (!fired || busy) return;
  await runEventPass(host, seam, loopId);
}

function isSnoozed(loop: Loop, now: string): boolean {
  return Boolean(loop.runtime.snoozedUntil && Date.parse(loop.runtime.snoozedUntil) > Date.parse(now));
}

/**
 * Starts the next event-fired iteration (cron semantics): drops the previous
 * iteration's worktree and re-arms the plan. The re-arm reads the CURRENT
 * on-disk loop inside updateState — never a caller-held copy — so an event
 * enqueued concurrently is never overwritten. The queued events survive the
 * re-arm; the engine consumes the head into the run's `firedBy` and an
 * `event` observation.
 */
async function runEventPass(host: OrchestratorHost, seam: CoordinatorRunSeam, loopId: string): Promise<void> {
  let rearmed: Loop | undefined;
  let prior: Loop['runtime']['workspace']['resolved'];
  await host.updateState((state) => {
    const current = state.loops.find((l) => l.id === loopId);
    if (!current || current.status !== 'active') return state;
    prior = current.runtime.workspace.resolved; // captured pre-rearm: rearmLoop clears workspace
    rearmed = rearmLoop(current, host.now());
    return { ...state, loops: state.loops.map((l) => (l.id === loopId ? rearmed! : l)) };
  });
  if (!rearmed) return;
  if (prior?.type === 'managed-worktree') {
    await host.removeWorktree(prior.worktreeKey ?? loopId, { force: true });
  }
  await seam.runNext(loopId, rearmed);
}
