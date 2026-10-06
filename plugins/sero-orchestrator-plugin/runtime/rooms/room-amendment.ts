/**
 * Driving a grant amendment from saved intent to an effective configuration.
 *
 * The Room's grant lives in the host and its configuration lives in the Room
 * record, so no single write can change both. Each step is saved before the
 * next, and the host dedupes on the revision's command id, so a repeat of any
 * step is safe:
 *
 *   intent saved -> members at a safe point -> host amended (`hold`)
 *     -> Room configuration saved with the new grant revision
 *     -> same bound session reopened -> configuration confirmed -> applied
 *
 * Anything that stops the chain short is a recoverable HOLD with a plain
 * reason. It never issues a second grant and never saves half a configuration.
 * After a restart `reconcile` asks the host again with the same id and
 * continues from the step that was not finished.
 */

import type { PersistentSessionExpansion, PersistentSessionGrantAmendmentResult } from '@sero-ai/common';
import type { OrchestratorHost } from '../host';
import { requirePersistentSessions } from './member-grant';
import type { MemberSessionPool } from './member-session';
import { timelineEvent } from './room-actions';
import {
  findAmendment,
  grantRevisionOf,
  pendingChange,
  withAmendmentState,
} from './room-amendment-record';
import { applyRevisionToRoom } from './room-revision-mutate';
import { withRevisionApplied } from './room-revision-record';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

export interface RoomAmendmentDeps {
  host: OrchestratorHost;
  store: RoomStore;
  /** `settled` is the safe-boundary seam: it resolves when a member's turn ends. */
  sessions: Pick<MemberSessionPool, 'settled' | 'release' | 'ensure'>;
  /** Called once held work may run again, so the scheduler looks at the Room. */
  resume?(roomId: string): Promise<void>;
  /** Tells affected members what changed, through the durable mailbox. */
  notify?(roomId: string, memberIds: string[], summary: string): Promise<void>;
}

export interface AmendmentAnswer {
  ok: boolean;
  reason?: string;
}

export interface RoomAmendments {
  /** Starts the saved intent of a revision. Returns at once; `settled` waits for it. */
  start(roomId: string, revisionId: string): void;
  /** The user approves a held revision: the same amendment is asked again, with a dialog. */
  approve(roomId: string, revisionId: string): Promise<AmendmentAnswer>;
  /** The user declines a held revision. The Room keeps its old configuration. */
  decline(roomId: string, revisionId: string): Promise<AmendmentAnswer>;
  /** Restart: finishes every revision still pending, before anything affected is scheduled. */
  reconcile(): Promise<void>;
  /** Resolves when everything queued for the Room (or every Room) has finished. */
  settled(roomId?: string): Promise<void>;
}

const describeExpansion = (added: PersistentSessionExpansion[]): string =>
  added.map((entry) => `${entry.subject}: ${entry.field} ${entry.value}`).join('; ');

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createRoomAmendments(deps: RoomAmendmentDeps): RoomAmendments {
  const { host, store } = deps;
  const chains = new Map<string, Promise<unknown>>();

  async function readRecord(roomId: string): Promise<RoomRecord> {
    const record = await store.readRoom(roomId);
    if (!record) throw new Error(`unknown room: ${roomId}`);
    return record;
  }

  /** One amendment at a time per Room, so two revisions never race for one grant revision. */
  function enqueue<T>(roomId: string, task: () => Promise<T>): Promise<T> {
    const run = (chains.get(roomId) ?? Promise.resolve()).then(task, task);
    const tail = run.then(() => undefined, () => undefined);
    chains.set(roomId, tail);
    return run;
  }

  async function setState(
    roomId: string,
    revisionId: string,
    update: Omit<Parameters<typeof withAmendmentState>[2], 'now'>,
  ): Promise<void> {
    await store.updateRoom(roomId, (record) => withAmendmentState(record, revisionId, { ...update, now: host.now() }));
  }

  async function hold(roomId: string, revisionId: string, reason: string, adds: PersistentSessionExpansion[] = []): Promise<AmendmentAnswer> {
    const found = findAmendment(await readRecord(roomId), revisionId);
    // Once the Room is saved the new configuration is the only one a session may
    // open with, so its members stay stopped until the reopen is confirmed.
    await setState(roomId, revisionId, {
      state: 'held',
      reason,
      adds,
      workPaused: found?.amendment.phase === 'configured',
    });
    host.log(`room ${roomId}: amendment ${revisionId} held: ${reason}`);
    await deps.resume?.(roomId);
    return { ok: false, reason };
  }

  async function close(roomId: string, revisionId: string, state: 'declined', reason: string): Promise<AmendmentAnswer> {
    await setState(roomId, revisionId, { state, reason, workPaused: false });
    await deps.resume?.(roomId);
    return { ok: false, reason };
  }

  /** Waits for each member to reach a safe point. A turn is never aborted to get there. */
  async function awaitSafePoint(roomId: string, memberIds: string[]): Promise<boolean> {
    for (let round = 0; round < 3; round += 1) {
      await Promise.all(memberIds.map((memberId) => deps.sessions.settled(roomId, memberId)));
      const record = await store.readRoom(roomId);
      const busy = record?.members.some((member) => memberIds.includes(member.id) && member.status === 'working');
      if (!busy) return true;
    }
    return false;
  }

  /** Rebases the expected revision (only while the host has never been asked) and marks the call as made. */
  async function beginHostCall(roomId: string, revisionId: string): Promise<void> {
    await store.updateRoom(roomId, (record) => ({
      ...record,
      revisions: record.revisions.map((revision) => revision.id === revisionId && revision.amendment
        ? {
            ...revision,
            amendment: {
              ...revision.amendment,
              attempted: true,
              expectedRevision: revision.amendment.attempted
                ? revision.amendment.expectedRevision
                : grantRevisionOf(record),
            },
          }
        : revision),
    }));
  }

  /** The clamped policy must still contain what the member was configured with. */
  function clampProblem(record: RoomRecord, revisionId: string, result: Extract<PersistentSessionGrantAmendmentResult, { status: 'applied' }>): string | null {
    const found = findAmendment(record, revisionId);
    if (!found) return null;
    for (const [subject, requested] of Object.entries(found.amendment.subjects)) {
      const granted = result.subjects[subject];
      if (!granted) return `The host did not keep ${subject} in the grant.`;
      const missing = [
        ...requested.allowedModels.filter((model) => !granted.allowedModels.includes(model)),
        ...(requested.allowedThinkingLevels ?? []).filter((level) => !(granted.allowedThinkingLevels ?? []).includes(level)),
        ...requested.allowedSkills.filter((skill) => !granted.allowedSkills.includes(skill)),
      ];
      if (missing.length > 0) return `The host granted ${subject} less than was asked (${missing.join(', ')}), so nothing was changed.`;
    }
    return null;
  }

  /** Step (d): the Room configuration and the new grant revision, in one durable write. */
  async function saveConfiguration(
    roomId: string,
    revisionId: string,
    result: Extract<PersistentSessionGrantAmendmentResult, { status: 'applied' }>,
  ): Promise<void> {
    await store.transact(roomId, null, (current) => {
      const found = findAmendment(current, revisionId);
      if (!found || found.amendment.phase !== 'intent' || !found.revision.proposal) return { record: null, result: null };
      const now = host.now();
      const mutated = applyRevisionToRoom(current, found.revision.proposal, now);
      const joined = new Set(mutated.members.map((member) => member.id).filter((id) => !current.members.some((m) => m.id === id)));
      const members = mutated.members.map((member) => {
        const granted = result.subjects[member.id];
        if (!granted) return member;
        const joining = joined.has(member.id);
        return {
          ...member,
          // Asked for exactly what the host granted, or the open is denied.
          session: { ...member.session, grantedTools: granted.allowedTools },
          ...(joining
            ? { status: 'idle' as const, statusDetail: 'Taking over.', configurationChange: pendingChange(revisionId, [], now) }
            : {}),
        };
      });
      const next: RoomRecord = {
        ...current,
        ...mutated,
        members,
        definition: { ...mutated.definition, grantRevision: result.revision },
      };
      return {
        record: withAmendmentState(next, revisionId, {
          state: 'pending',
          workPaused: true,
          grantRevision: result.revision,
          amendment: { phase: 'configured' },
          now,
        }),
        result: null,
      };
    });
  }

  /** Steps (e) and (f): reopen the SAME session, confirm the configuration, then report applied. */
  async function reopenAndConfirm(roomId: string, revisionId: string): Promise<AmendmentAnswer> {
    const found = findAmendment(await readRecord(roomId), revisionId);
    const proposal = found?.revision.proposal;
    if (!found || !proposal) return hold(roomId, revisionId, 'The change this revision carried was not recorded.');
    try {
      for (const memberId of found.amendment.retire) await deps.sessions.release(roomId, memberId);
      for (const memberId of found.amendment.memberIds) {
        if (found.amendment.retire.includes(memberId)) continue;
        const before = await store.readMember(roomId, memberId);
        if (!before?.session.sessionId) continue;
        await deps.sessions.release(roomId, memberId);
        const room = await readRecord(roomId);
        const member = room.members.find((candidate) => candidate.id === memberId);
        if (!member) throw new Error(`${memberId} left the Room while its session was reopening`);
        const handle = await deps.sessions.ensure(room, member);
        if (handle.sessionId !== before.session.sessionId) {
          throw new Error(`${memberId} reopened on a different session`);
        }
      }
    } catch (error) {
      return hold(roomId, revisionId, `The member session could not be reopened with its new setup: ${messageOf(error)}`);
    }
    const now = host.now();
    await store.transact(roomId, null, (current) => {
      const again = findAmendment(current, revisionId);
      if (!again || again.amendment.state === 'applied') return { record: null, result: null };
      const next = withAmendmentState(current, revisionId, {
        state: 'applied',
        workPaused: false,
        grantRevision: again.amendment.grantRevision,
        now,
      });
      const applied = next.revisions.find((revision) => revision.id === revisionId);
      return { record: applied ? withRevisionApplied(next, next, applied, now) : next, result: null };
    });
    await store.appendTimeline(roomId, [timelineEvent(host, roomId, 'revision', found.revision.actorMemberId, found.revision.summary)]);
    const affected = [...found.amendment.memberIds, ...Object.keys(found.amendment.subjects)];
    await deps.notify?.(roomId, [...new Set(affected)], found.revision.summary);
    await deps.resume?.(roomId);
    return { ok: true };
  }

  async function drive(roomId: string, revisionId: string, mode: 'hold' | 'ask'): Promise<AmendmentAnswer> {
    const record = await store.readRoom(roomId);
    const found = record ? findAmendment(record, revisionId) : null;
    if (!record || !found) return { ok: false, reason: 'This change is no longer recorded.' };
    const { amendment } = found;
    if (amendment.state === 'applied' || amendment.state === 'declined') return { ok: true };
    if (!record.definition.grantId) {
      const reason = 'The Room finished before this change could be applied.';
      await setState(roomId, revisionId, { state: 'declined', reason, workPaused: false });
      return { ok: false, reason };
    }
    // The host already committed this change and the Room saved it: only the reopen is left.
    if (amendment.phase === 'configured') return reopenAndConfirm(roomId, revisionId);

    // Held work pauses again so it can reach a safe point before the host is asked.
    if (amendment.state === 'held') await setState(roomId, revisionId, { state: 'pending', workPaused: true });
    if (!(await awaitSafePoint(roomId, amendment.memberIds))) {
      return hold(roomId, revisionId, 'A member is still working, so its setup was not changed yet.');
    }

    let result: PersistentSessionGrantAmendmentResult;
    try {
      await beginHostCall(roomId, revisionId);
      const current = findAmendment(await readRecord(roomId), revisionId)?.amendment ?? amendment;
      result = await requirePersistentSessions(host).amendGrant({
        grantId: current.grantId,
        amendmentId: current.amendmentId,
        expectedRevision: current.expectedRevision,
        subjects: current.subjects,
        retire: current.retire,
        approval: mode,
        reason: found.revision.summary,
      });
    } catch (error) {
      // The host may or may not have applied it. The same id asks again safely.
      return hold(roomId, revisionId, `Sero could not confirm the change with the host (${messageOf(error)}). It can be tried again.`);
    }

    switch (result.status) {
      case 'applied': {
        const problem = clampProblem(await readRecord(roomId), revisionId, result);
        if (problem) return hold(roomId, revisionId, problem);
        await saveConfiguration(roomId, revisionId, result);
        return reopenAndConfirm(roomId, revisionId);
      }
      case 'needs-approval':
        return hold(roomId, revisionId, `This adds access, so it needs your approval: ${describeExpansion(result.expansion)}.`, result.expansion);
      case 'declined':
        return close(roomId, revisionId, 'declined', 'The change was declined.');
      case 'stale':
        // The host's number is the truth. Taking it lets a fresh proposal succeed.
        await store.updateRoom(roomId, (current) => ({
          ...current,
          definition: { ...current.definition, grantRevision: result.revision },
        }));
        return hold(roomId, revisionId, 'The Room\'s permissions changed while this waited, so it was not applied. Decline it and ask again.');
      case 'refused':
        return hold(roomId, revisionId, result.reason);
    }
  }

  return {
    start(roomId, revisionId) {
      void enqueue(roomId, () => drive(roomId, revisionId, 'hold')).catch((error: unknown) =>
        host.log(`room ${roomId}: amendment ${revisionId} failed: ${messageOf(error)}`));
    },

    async approve(roomId, revisionId) {
      const found = findAmendment(await readRecord(roomId), revisionId);
      if (found?.amendment.state !== 'held') return { ok: false, reason: 'There is nothing held to approve.' };
      return enqueue(roomId, () => drive(roomId, revisionId, 'ask'));
    },

    async decline(roomId, revisionId) {
      return enqueue(roomId, async () => {
        const found = findAmendment(await readRecord(roomId), revisionId);
        if (found?.amendment.state !== 'held') return { ok: false, reason: 'There is nothing held to decline.' };
        // Past the host commit the new setup is already the Room's, so only a retry can finish it.
        if (found.amendment.phase === 'configured') {
          return { ok: false, reason: 'The host already applied this change. Try it again instead.' };
        }
        await close(roomId, revisionId, 'declined', 'You declined this change.');
        return { ok: true };
      });
    },

    async reconcile() {
      const state = await store.readState();
      const waiting: Promise<unknown>[] = [];
      for (const record of state.rooms) {
        for (const revision of record.revisions) {
          const amendment = revision.amendment;
          if (!amendment) continue;
          if (amendment.state === 'pending' || (amendment.state === 'held' && amendment.phase === 'configured')) {
            waiting.push(enqueue(record.definition.id, () => drive(record.definition.id, revision.id, 'hold')).catch(
              (error: unknown) => host.log(`room ${record.definition.id}: amendment ${revision.id} failed: ${messageOf(error)}`),
            ));
          }
        }
      }
      await Promise.all(waiting);
    },

    async settled(roomId) {
      await Promise.all(roomId ? [chains.get(roomId)] : [...chains.values()]);
    },
  };
}
