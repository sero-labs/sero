// Event-trigger routing (Phase 5/6). An `event`/`hybrid` trigger marks its loop
// due when a lifecycle event matches — never a polled check, a real subscription
// (Principle 6 / push-model). Marking due dispatches the SAME gated `run_next`
// the cron scheduler uses, so the per-loop lock, eligibility, and stop rule still
// apply (and a fire during a running attempt defers to one rerun after it
// resolves, via `queueIfBusy`).
//
// Wired sources (each backed by a real host subscription seam):
//   • session   → host.session.onTurnComplete (per session)
//   • vcs       → host.git.onCommit          (per workspace; VcsManager events)
//   • workspace → host.workspace.onChange    (per workspace; recursive fs.watch)
// `check` has no host subscription seam (verification is on-demand only, and the
// orchestrator is its sole caller — a check trigger would fire on the loop's own
// checks), so it stays logged as not-yet-wired rather than fabricated.
//
// Self-retrigger guards: a loop's OWN work must never re-fire its own triggers.
//   • session — the active-session adapter tags its steered turn ids; a tagged
//     completion is skipped here.
//   • vcs/workspace — the engine marks the workspace busy for the duration of
//     each attempt; events while busy (plus a short grace for the watcher's
//     debounce tail) are the loop's own footprint and are skipped. Sero's own
//     metadata writes (state/artifacts/worktrees under .sero/) are also ignored.

import type { AppRuntimeHost } from '@sero-ai/common';

import type { LoopGoal, LoopTrigger } from '../shared/types';
import { isoNow, type Clock } from './clock';
import type { WorkerSessionRegistry } from './recursion-guard';
import type { SchedulerLog } from './scheduler';
import type { StateStore } from './state-store';

const SESSION_SOURCE = 'session';
const VCS_SOURCE = 'vcs';
const WORKSPACE_SOURCE = 'workspace';

/** Event sources with a live host subscription seam today. */
const WIRED_SOURCES: ReadonlySet<string> = new Set([
  SESSION_SOURCE,
  VCS_SOURCE,
  WORKSPACE_SOURCE,
]);

// After an orchestrator attempt finishes mutating a workspace, ignore vcs/
// workspace events for this long so the file-watcher's debounce tail (and any
// trailing checkpoint) never re-fires the loop that produced it.
const SELF_TRIGGER_GRACE_MS = 2_000;

export interface EventRouterDeps {
  host: AppRuntimeHost;
  workspaceId: string;
  store: StateStore;
  clock: Clock;
  /** Mark a loop due through the gated control plane (D-01); same path as cron. */
  runLoop: (loopId: string) => Promise<unknown>;
  /** Shared with the adapters + engine so the self-retrigger guards see our work. */
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
  private readonly sessionSubs = new Map<string, () => void>();
  /** The workspace's active session at last sync — target of most-recent-active triggers. */
  private activeSessionId: string | null = null;
  /** Live workspace-scoped subscriptions (one each), null when no trigger needs them. */
  private vcsUnsub: (() => void) | null = null;
  private workspaceUnsub: (() => void) | null = null;
  /** Non-wired sources already logged as not-yet-wired, so we warn once each. */
  private readonly warnedSources = new Set<string>();
  private disposed = false;

  constructor(private readonly deps: EventRouterDeps) {}

  /**
   * Reconcile subscriptions with the current loops: subscribe to every event
   * source an active trigger references (sessions, plus the workspace-scoped vcs
   * and workspace streams), drop any no longer referenced, and log any not-yet-
   * wired source once. Called on start and on every state change (a push), so
   * editing triggers re-targets immediately.
   */
  async sync(): Promise<void> {
    if (this.disposed) return;
    const state = await this.deps.store.read();
    const triggers = activeEventTriggers(state.loops);

    for (const { trigger } of triggers) {
      if (!WIRED_SOURCES.has(trigger.eventSource!)) this.warnUnwired(trigger.eventSource!);
    }

    this.syncVcs(triggers.some(({ trigger }) => trigger.eventSource === VCS_SOURCE));
    this.syncWorkspace(triggers.some(({ trigger }) => trigger.eventSource === WORKSPACE_SOURCE));
    await this.syncSessions(triggers.filter(({ trigger }) => trigger.eventSource === SESSION_SOURCE));
  }

  dispose(): void {
    this.disposed = true;
    for (const unsub of this.sessionSubs.values()) unsub();
    this.sessionSubs.clear();
    this.vcsUnsub?.();
    this.vcsUnsub = null;
    this.workspaceUnsub?.();
    this.workspaceUnsub = null;
  }

  // ── session source ───────────────────────────────────────────────────────────

  private async syncSessions(sessionTriggers: { loop: LoopGoal; trigger: LoopTrigger }[]): Promise<void> {
    if (sessionTriggers.length === 0) {
      for (const sessionId of [...this.sessionSubs.keys()]) this.unsubscribeSession(sessionId);
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

    for (const sessionId of needed) this.subscribeSession(sessionId);
    for (const sessionId of [...this.sessionSubs.keys()]) {
      if (!needed.has(sessionId)) this.unsubscribeSession(sessionId);
    }
  }

  private subscribeSession(sessionId: string): void {
    if (this.sessionSubs.has(sessionId)) return;
    const unsub = this.deps.host.session.onTurnComplete(sessionId, (completion) => {
      void this.onTurnComplete(sessionId, completion.turnId);
    });
    this.sessionSubs.set(sessionId, unsub);
  }

  private unsubscribeSession(sessionId: string): void {
    this.sessionSubs.get(sessionId)?.();
    this.sessionSubs.delete(sessionId);
  }

  /** A turn finished on a subscribed session: mark its session-triggered loops due. */
  private async onTurnComplete(sessionId: string, turnId: string): Promise<void> {
    if (this.disposed) return;
    // The loop's own active-session steer completes a turn too — never re-fire on it.
    if (this.deps.workerSessions.isOrchestratorTurn(turnId)) return;
    await this.markDue(
      (trigger, loop) =>
        trigger.eventSource === SESSION_SOURCE && this.targetsSession(trigger, loop, sessionId),
    );
  }

  /** A bound trigger matches its session; an unbound one matches the active session. */
  private targetsSession(trigger: LoopTrigger, loop: LoopGoal, sessionId: string): boolean {
    const bound = trigger.sessionId ?? loop.sessionId;
    return bound ? bound === sessionId : sessionId === this.activeSessionId;
  }

  // ── vcs source (commits / checkpoints) ─────────────────────────────────────────

  private syncVcs(hasTrigger: boolean): void {
    if (hasTrigger && !this.vcsUnsub) {
      this.vcsUnsub = this.deps.host.git.onCommit(this.deps.workspaceId, () => {
        void this.fireWorkspaceSource(VCS_SOURCE);
      });
    } else if (!hasTrigger && this.vcsUnsub) {
      this.vcsUnsub();
      this.vcsUnsub = null;
    }
  }

  // ── workspace source (file-tree changes) ───────────────────────────────────────

  private syncWorkspace(hasTrigger: boolean): void {
    if (hasTrigger && !this.workspaceUnsub) {
      this.workspaceUnsub = this.deps.host.workspace.onChange(this.deps.workspaceId, (event) => {
        // Ignore Sero's own metadata writes (state/artifacts/worktrees under .sero/).
        if (event.directories.every(isSeroInternalDir)) return;
        void this.fireWorkspaceSource(WORKSPACE_SOURCE);
      });
    } else if (!hasTrigger && this.workspaceUnsub) {
      this.workspaceUnsub();
      this.workspaceUnsub = null;
    }
  }

  /** Mark loops due for a workspace-scoped source, unless the change is our own footprint. */
  private async fireWorkspaceSource(source: string): Promise<void> {
    if (this.disposed) return;
    if (
      this.deps.workerSessions.isWorkspaceSettling(
        this.deps.workspaceId,
        this.deps.clock(),
        SELF_TRIGGER_GRACE_MS,
      )
    ) {
      return;
    }
    await this.markDue((trigger) => trigger.eventSource === source);
  }

  // ── shared dispatch ────────────────────────────────────────────────────────────

  /**
   * Advance every matching trigger in one mutation (single-writer) and run the
   * loops that became due through the gated control plane. A loop with several
   * matching triggers still runs once.
   */
  private async markDue(
    matches: (trigger: LoopTrigger, loop: LoopGoal) => boolean,
  ): Promise<void> {
    const nowMs = this.deps.clock();
    const dueLoopIds: string[] = [];
    await this.deps.store.mutate((state) => {
      for (const loop of state.loops) {
        if (loop.status !== 'active') continue;
        let loopDue = false;
        for (const trigger of loop.triggers) {
          if (!isEventTrigger(trigger)) continue;
          if (!matches(trigger, loop)) continue;
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

  private warnUnwired(source: string): void {
    if (this.warnedSources.has(source)) return;
    this.warnedSources.add(source);
    this.deps.log?.('event source has no host subscription seam yet — not wired', { source });
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

/** A change confined to Sero's own metadata (state/artifacts/worktrees under .sero/). */
function isSeroInternalDir(dir: string): boolean {
  return dir.split('/').includes('.sero');
}
