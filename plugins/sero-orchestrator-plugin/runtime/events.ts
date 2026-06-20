// Event-trigger routing (Phase 5). An `event`/`hybrid` trigger marks its loop
// due when a lifecycle event matches — never a polled check, a real subscription
// (Principle 6 / push-model). Marking due dispatches the SAME gated `run_next`
// the cron scheduler uses, so the per-loop lock, eligibility, and stop rule still
// apply (and a fire during a running attempt defers to one rerun after it
// resolves, via `queueIfBusy`).
//
// Scope (decided with the product owner): the only host event seam that exists
// today is session turn completion (`host.session.onTurnComplete`), so `session`
// triggers are wired now. The other declared sources (`vcs`, `check`,
// `workspace`) have no host subscription seam yet — they are logged as not-yet-
// wired rather than silently ignored, and become a host.* follow-up (Phase 6).
//
// Self-retrigger guard: a loop's OWN active-session attempt completes a turn too.
// The adapter tags those turn ids (recursion-guard), and a tagged completion is
// skipped here, so a session trigger never re-fires on the loop's own steer.

import type { AppRuntimeHost } from '@sero-ai/common';

import type { LoopGoal, LoopTrigger } from '../shared/types';
import { isoNow, type Clock } from './clock';
import type { WorkerSessionRegistry } from './recursion-guard';
import type { SchedulerLog } from './scheduler';
import type { StateStore } from './state-store';

/** The one event source with a live host subscription seam today. */
const SESSION_SOURCE = 'session';

export interface EventRouterDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  store: StateStore;
  clock: Clock;
  /** Mark a loop due through the gated control plane (D-01); same path as cron. */
  runLoop: (loopId: string) => Promise<unknown>;
  /** Shared with the adapters so the self-retrigger guard sees steered turns. */
  workerSessions: WorkerSessionRegistry;
  log?: SchedulerLog;
}

/** An enabled event/hybrid trigger that names an event source. */
function isEventTrigger(trigger: LoopTrigger): boolean {
  return (
    !trigger.disabled &&
    (trigger.type === 'event' || trigger.type === 'hybrid') &&
    Boolean(trigger.eventSource)
  );
}

function canFire(trigger: LoopTrigger, nowMs: number): boolean {
  if (trigger.maxFires !== undefined && trigger.fireCount >= trigger.maxFires) return false;
  if (trigger.debounceMs && trigger.lastFireAt) {
    if (nowMs - new Date(trigger.lastFireAt).getTime() < trigger.debounceMs) return false;
  }
  return true;
}

export class EventRouter {
  /** Live `onTurnComplete` unsubscribers, keyed by session id. */
  private readonly subscriptions = new Map<string, () => void>();
  /** The workspace's active session at last sync — target of most-recent-active triggers. */
  private activeSessionId: string | null = null;
  /** Non-session sources already logged as not-yet-wired, so we warn once each. */
  private readonly warnedSources = new Set<string>();
  private disposed = false;

  constructor(private readonly deps: EventRouterDeps) {}

  /**
   * Reconcile subscriptions with the current loops: subscribe to every session a
   * session-event trigger targets, drop sessions no longer referenced, and log
   * any not-yet-wired event source once. Called on start and on every state
   * change (a push), so editing triggers re-targets immediately.
   */
  async sync(): Promise<void> {
    if (this.disposed) return;
    const state = await this.deps.store.read();
    const triggers = activeEventTriggers(state.loops);

    for (const { trigger } of triggers) {
      if (trigger.eventSource !== SESSION_SOURCE) this.warnUnwired(trigger.eventSource!);
    }

    const sessionTriggers = triggers.filter(({ trigger }) => trigger.eventSource === SESSION_SOURCE);
    if (sessionTriggers.length === 0) {
      this.unsubscribeAll();
      this.activeSessionId = null;
      return;
    }

    const active = await this.deps.host.session.getActiveForWorkspace(this.deps.workspaceId);
    if (this.disposed) return;
    this.activeSessionId = active?.sessionId ?? null;

    const needed = new Set<string>();
    for (const { loop, trigger } of sessionTriggers) {
      const target = trigger.sessionId ?? loop.sessionId ?? this.activeSessionId;
      if (target) needed.add(target);
    }

    for (const sessionId of needed) this.subscribe(sessionId);
    for (const sessionId of [...this.subscriptions.keys()]) {
      if (!needed.has(sessionId)) this.unsubscribe(sessionId);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribeAll();
  }

  private subscribe(sessionId: string): void {
    if (this.subscriptions.has(sessionId)) return;
    const unsub = this.deps.host.session.onTurnComplete(sessionId, (completion) => {
      void this.onTurnComplete(sessionId, completion.turnId);
    });
    this.subscriptions.set(sessionId, unsub);
  }

  private unsubscribe(sessionId: string): void {
    this.subscriptions.get(sessionId)?.();
    this.subscriptions.delete(sessionId);
  }

  private unsubscribeAll(): void {
    for (const unsub of this.subscriptions.values()) unsub();
    this.subscriptions.clear();
  }

  private warnUnwired(source: string): void {
    if (this.warnedSources.has(source)) return;
    this.warnedSources.add(source);
    this.deps.log?.('event source has no host subscription seam yet — not wired', { source });
  }

  /** A turn finished on a subscribed session: mark its session-triggered loops due. */
  private async onTurnComplete(sessionId: string, turnId: string): Promise<void> {
    if (this.disposed) return;
    // The loop's own active-session steer completes a turn too — never re-fire on it.
    if (this.deps.workerSessions.isOrchestratorTurn(turnId)) return;

    const nowMs = this.deps.clock();
    const dueLoopIds: string[] = [];
    // Advance every matching trigger in one mutation (single-writer); collect the
    // loops to run. A loop with several matching triggers still runs once.
    await this.deps.store.mutate((state) => {
      for (const loop of state.loops) {
        if (loop.status !== 'active') continue;
        let loopDue = false;
        for (const trigger of loop.triggers) {
          if (!isEventTrigger(trigger) || trigger.eventSource !== SESSION_SOURCE) continue;
          if (!this.targetsSession(trigger, loop, sessionId)) continue;
          if (!canFire(trigger, nowMs)) continue;
          trigger.fireCount += 1;
          trigger.lastFireAt = new Date(nowMs).toISOString();
          loopDue = true;
        }
        if (loopDue) {
          loop.updatedAt = isoNow(this.deps.clock);
          dueLoopIds.push(loop.id);
        }
      }
      return null;
    });

    for (const loopId of dueLoopIds) {
      void this.deps.runLoop(loopId).catch((err) => {
        this.deps.log?.('event run failed', {
          loopId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }
  }

  /** A bound trigger matches its session; an unbound one matches the active session. */
  private targetsSession(trigger: LoopTrigger, loop: LoopGoal, sessionId: string): boolean {
    const bound = trigger.sessionId ?? loop.sessionId;
    return bound ? bound === sessionId : sessionId === this.activeSessionId;
  }
}

/** Flatten active loops to their enabled event triggers, keeping the owning loop. */
function activeEventTriggers(loops: LoopGoal[]): { loop: LoopGoal; trigger: LoopTrigger }[] {
  const out: { loop: LoopGoal; trigger: LoopTrigger }[] = [];
  for (const loop of loops) {
    if (loop.status !== 'active') continue;
    for (const trigger of loop.triggers) {
      if (isEventTrigger(trigger)) out.push({ loop, trigger });
    }
  }
  return out;
}
