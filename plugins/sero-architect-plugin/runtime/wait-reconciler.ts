/**
 * Observes the owner's waits and turns an ended wait into one owner wake.
 *
 * Nothing here polls. A reconcile runs because something happened: a watched
 * index changed, the runtime started, the user resumed, a turn ended, or one
 * timer armed for a deadline fired. Each reconcile re-reads the durable state
 * of every open wait's source, so a notification is only a hint to look and a
 * missed or duplicate one changes nothing.
 *
 * A `child` wait (a Room or Workflow this project started) is read from the
 * index files the dispatch watch follows. A `process` wait is read from the
 * host's dev server list, and a change to any server asks again. A `ci` wait
 * is read from GitHub: while one is open, this source reads again every two
 * minutes. That bounded read is the only repeated one, and it never starts a
 * turn on its own; only an ended wait does.
 */

import { CI_WAIT_READ_INTERVAL_MS, ciWaitOutcome, ciWaitRefusal, processWaitOutcome, processWaitRefusal, type AppRuntimeDevServer, type AppRuntimeRefChecks } from '@sero-ai/common';
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
  type WaitSourceKind,
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
  /** The dev servers of a workspace, with their real status. */
  listDevServers(workspaceId: string): AppRuntimeDevServer[];
  /** One read of the CI checks of a branch or commit in the repo at this path. */
  refChecks(repoPath: string, ref: string): Promise<AppRuntimeRefChecks>;
}

export interface WaitReconciler {
  /** Re-reads every open wait's source, ends what ended, reserves wakes and requests them. */
  reconcile(projectId: string, sources?: WaitSources | null): Promise<void>;
  /** Why a process or CI wait on this source could never end, or null when it can be registered. */
  admit(record: ProjectRecord, kind: WaitSourceKind, id: string): Promise<string | null>;
  /** A dev server changed: the projects waiting on it read it again. */
  devServerChanged(serverId: string): void;
  /** Takes the reserved wakes for a turn about to start. Returns the ones taken; none while work may not start. */
  consume(projectId: string): Promise<WaitRegistration[]>;
  /** The turn's prompt was accepted: the wakes taken for it are delivered. */
  started(projectId: string): Promise<void>;
  /** Wakes taken for a turn that never started are reserved again. Startup and a failed start call it. */
  requeue(projectId: string): Promise<void>;
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

/** What the host showed of a project's processes and CI refs in one reconcile. Absent means not read. */
interface ExternalReads {
  servers: AppRuntimeDevServer[] | null;
  checks: Map<string, AppRuntimeRefChecks>;
}

function externalOutcome(wait: WaitRegistration, reads: ExternalReads): { kind: WaitOutcomeKind; detail: string } | null {
  if (wait.source.kind === 'process') {
    return reads.servers ? processWaitOutcome(wait.source.id, reads.servers.find((server) => server.id === wait.source.id)) : null;
  }
  const checks = wait.source.kind === 'ci' ? reads.checks.get(wait.source.id) : undefined;
  return checks ? ciWaitOutcome(wait.source.id, checks) : null;
}

const subjectOf = (wait: WaitRegistration) => (wait.owner.milestoneId ? { kind: 'milestone' as const, id: wait.owner.milestoneId, label: null } : undefined);

export function createWaitReconciler(deps: WaitReconcilerDeps): WaitReconciler {
  const { store } = deps;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const ciTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Which projects wait on which dev server, refreshed by every reconcile. */
  const serverWaiters = new Map<string, Set<string>>();

  const follow = (projectId: string, record: ProjectRecord | null): void => {
    for (const waiters of serverWaiters.values()) waiters.delete(projectId);
    for (const wait of record ? openWaits(record) : []) {
      if (wait.source.kind !== 'process') continue;
      const waiters = serverWaiters.get(wait.source.id) ?? new Set<string>();
      waiters.add(projectId);
      serverWaiters.set(wait.source.id, waiters);
    }
    clearTimeout(ciTimers.get(projectId));
    ciTimers.delete(projectId);
    if (!record || !openWaits(record).some((wait) => wait.source.kind === 'ci')) return;
    const timer = setTimeout(() => { void reconcile(projectId); }, CI_WAIT_READ_INTERVAL_MS);
    timer.unref?.();
    ciTimers.set(projectId, timer);
  };

  /** Reads the dev servers and CI refs the open waits name, before the queued write. */
  async function readExternal(record: ProjectRecord): Promise<ExternalReads> {
    const open = openWaits(record);
    const servers = record.workspaceId && open.some((wait) => wait.source.kind === 'process') ? deps.listDevServers(record.workspaceId) : null;
    const refs = [...new Set(open.filter((wait) => wait.source.kind === 'ci').map((wait) => wait.source.id))];
    const checks = new Map<string, AppRuntimeRefChecks>();
    for (const ref of refs) {
      const read = await deps.refChecks(record.folder, ref);
      // A failed read observes nothing: the wait stays open and is read again.
      if (read.state === 'unknown') deps.log(`could not read the CI checks of ${ref} for ${record.id}: ${read.reason ?? 'unknown error'}`);
      else checks.set(ref, read);
    }
    return { servers, checks };
  }

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
    const open = openWaits(peek);
    const sources = open.some((wait) => wait.source.kind === 'child') ? (given?.loops && given.rooms ? given : await deps.readSources(projectId)) : null;
    const external = await readExternal(peek);
    const now = deps.now();
    const written = await store.update(projectId, (record) => {
      let next = record;
      for (const wait of openWaits(record)) {
        const seen = wait.source.kind === 'child' ? (sources ? childOutcome(wait.source.id, sources) : null) : externalOutcome(wait, external);
        if (!seen) continue;
        next = observeWait(next, wait.id, seen.kind, now, seen.detail);
        // An outcome nobody can confirm holds the project; it is never taken as success.
        if (seen.kind === 'uncertain') {
          const held = block(next, now, `could not confirm the outcome of ${wait.source.kind} ${wait.source.id}: ${seen.detail}`);
          if (held.ok) next = held.record;
        }
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
    follow(projectId, after);
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
    async admit(record, kind, id) {
      if (kind === 'process') {
        if (!record.workspaceId) return 'This project has no workspace, so it has no dev servers to wait on.';
        return processWaitRefusal(id, deps.listDevServers(record.workspaceId).find((server) => server.id === id));
      }
      return kind === 'ci' ? ciWaitRefusal(id, await deps.refChecks(record.folder, id)) : null;
    },
    devServerChanged(serverId) {
      for (const projectId of serverWaiters.get(serverId) ?? []) void reconcile(projectId).catch((error: unknown) => {
        deps.log(`could not reconcile the waits of ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
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
    dispose() {
      for (const timer of [...timers.values(), ...ciTimers.values()]) clearTimeout(timer);
      timers.clear();
      ciTimers.clear();
      serverWaiters.clear();
    },
  };
}
