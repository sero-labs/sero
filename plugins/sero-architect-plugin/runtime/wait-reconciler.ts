/**
 * Observes the owner's waits and turns an ended wait into one owner wake.
 *
 * Nothing here polls. A reconcile runs because something happened: a watched
 * index changed, the runtime started, the user resumed, a turn ended, or one
 * timer armed for a deadline fired. Each reconcile re-reads the durable state
 * of every open wait's source, so a notification is only a hint to look and a
 * missed or duplicate one changes nothing.
 *
 * Only `child` waits (a Room or Workflow this project started) have a source
 * the runtime can read. The dispatch watch already follows their index files.
 */

import { appendHistory, block, settle } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import {
  consumeWake,
  describeWait,
  expireDueWaits,
  nextDeadline,
  observeWait,
  openWaits,
  reservedWakes,
  requeueUndelivered,
  reserveWake,
  unreservedMatches,
  wakeStarted,
  waitMayWake,
  type WaitOutcomeKind,
  type WaitRegistration,
} from '../shared/waits';
import type { RecordStore } from './record-store';

/** What a reconcile may read of a Workflow or Room. Absent lists were not read. */
export interface WaitSources {
  loops: { id: string; status: string; block?: { reason: string } }[] | null;
  rooms: { id: string; status: string }[] | null;
}

export interface WaitReconcilerDeps {
  store: RecordStore;
  now(): string;
  wake(projectId: string, wake: WakeEvent): void;
  log(message: string): void;
  /** Reads the project's source index files afresh. Null when the project is not watched. */
  readSources(projectId: string): Promise<WaitSources | null>;
}

export interface WaitReconciler {
  /** Re-reads every open wait's source, ends what ended, reserves wakes and requests them. */
  reconcile(projectId: string, sources?: WaitSources | null): Promise<void>;
  /** Takes the reserved wakes for a turn about to start. Returns the ones taken; none while work may not start. */
  consume(projectId: string): Promise<WaitRegistration[]>;
  /** The turn's prompt was accepted: the wakes taken for it are delivered. */
  started(projectId: string): Promise<void>;
  /** Wakes taken for a turn that never started are reserved again. Startup and a failed start call it. */
  requeue(projectId: string): Promise<void>;
  /** An outcome that could not be confirmed: recorded, and the project is held with that reason. */
  holdUncertain(projectId: string, waitId: string, detail: string): Promise<void>;
  dispose(): void;
}

/** The wait's line, plus the delivery receipt its milestone has: the receipt's own wake is folded into this one. */
function describeWithReceipt(record: ProjectRecord, wait: WaitRegistration): string {
  const receipt = wait.owner.milestoneId ? record.milestones.find((m) => m.id === wait.owner.milestoneId)?.receipt : undefined;
  return receipt ? `${describeWait(wait)} The result has a delivery receipt at ${receipt}.` : describeWait(wait);
}

/** How a source ended, or null while it has not. */
function childOutcome(id: string, sources: WaitSources): { kind: WaitOutcomeKind; detail: string } | null {
  const loop = sources.loops?.find((item) => item.id === id);
  if (loop) {
    if (loop.status === 'complete') return { kind: 'satisfied', detail: 'The Workflow reported completion. That is a claim until evidence passes.' };
    if (loop.status === 'blocked') return { kind: 'failed', detail: `The Workflow is blocked${loop.block?.reason ? `: ${loop.block.reason}` : ''}.` };
    return null;
  }
  const room = sources.rooms?.find((item) => item.id === id);
  if (room) {
    if (room.status === 'completed') return { kind: 'satisfied', detail: 'The Room completed. That is a claim until evidence passes.' };
    if (room.status === 'failed' || room.status === 'cancelled') return { kind: 'failed', detail: `The Room ${room.status}.` };
    return null;
  }
  // Both lists were read and neither names it: the source is gone.
  return sources.loops && sources.rooms ? { kind: 'failed', detail: 'The Workflow or Room no longer exists.' } : null;
}

const subjectOf = (wait: WaitRegistration) => (wait.owner.milestoneId ? { kind: 'milestone' as const, id: wait.owner.milestoneId, label: null } : undefined);

export function createWaitReconciler(deps: WaitReconcilerDeps): WaitReconciler {
  const { store } = deps;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const arm = (projectId: string, record: ProjectRecord | null): void => {
    clearTimeout(timers.get(projectId));
    timers.delete(projectId);
    const deadline = record ? nextDeadline(record) : null;
    if (!deadline) return;
    // One timer to the earliest deadline, not a poll: it fires once, ends the
    // wait as expired, and arms again only if another deadline is open.
    const timer = setTimeout(() => { void reconcile(projectId); }, Math.max(0, Date.parse(deadline) - Date.parse(deps.now())));
    timer.unref?.();
    timers.set(projectId, timer);
  };

  async function reconcile(projectId: string, given?: WaitSources | null): Promise<void> {
    const peek = await store.read(projectId);
    if (!peek?.waits?.length) return;
    // Read the source before the queued write: it touches files.
    // A push carries one list; the other is read too, so every open wait sees both.
    const sources = openWaits(peek).length > 0 ? (given?.loops && given.rooms ? given : await deps.readSources(projectId)) : null;
    const now = deps.now();
    const written = await store.update(projectId, (record) => {
      let next = record;
      for (const wait of openWaits(record)) {
        const seen = sources && wait.source.kind === 'child' ? childOutcome(wait.source.id, sources) : null;
        if (seen) next = observeWait(next, wait.id, seen.kind, now, seen.detail);
      }
      next = expireDueWaits(next, now);
      for (const wait of next.waits ?? []) {
        const before = record.waits?.find((item) => item.id === wait.id);
        if (before?.outcome === null && wait.outcome) {
          next = appendHistory(next, now, describeWait(wait), subjectOf(wait));
        }
      }
      for (const wait of unreservedMatches(next)) {
        const reserved = reserveWake(next, wait.id, now);
        if (reserved.ok) next = reserved.record;
      }
      return next === record ? null : settle(next, now);
    });
    const after = written ?? await store.read(projectId);
    arm(projectId, after);
    if (!after || !waitMayWake(after)) return;
    // A reserved wake that was never started is requested again here: after a
    // restart, a resume or a dropped wake. The scheduler merges the repeats.
    const pending = reservedWakes(after);
    if (pending.length > 0) deps.wake(projectId, { kind: 'wait', at: now, items: pending.map((wait) => describeWithReceipt(after, wait)) });
  }

  return {
    reconcile: (projectId, sources) => reconcile(projectId, sources).catch((error: unknown) => {
      deps.log(`could not reconcile the waits of ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
    }),
    async consume(projectId) {
      const consumed: WaitRegistration[] = [];
      const now = deps.now();
      await store.update(projectId, (record) => {
        consumed.length = 0;
        let next = record;
        for (const wait of reservedWakes(record)) {
          const result = consumeWake(next, wait.id, now);
          if (result.ok) {
            next = result.record;
            consumed.push(wait);
          }
        }
        return next === record ? null : next;
      });
      return consumed;
    },
    async started(projectId) {
      await store.update(projectId, (record) => { const next = wakeStarted(record); return next === record ? null : next; });
    },
    async requeue(projectId) {
      await store.update(projectId, (record) => { const next = requeueUndelivered(record); return next === record ? null : next; });
    },
    async holdUncertain(projectId, waitId, detail) {
      const now = deps.now();
      await store.update(projectId, (record) => {
        const wait = record.waits?.find((item) => item.id === waitId);
        if (!wait || wait.outcome) return null;
        const observed = observeWait(record, waitId, 'uncertain', now, detail);
        const held = block(observed, now, `could not confirm the outcome of ${wait.source.kind} ${wait.source.id}: ${detail}`);
        return held.ok ? held.record : observed;
      });
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
