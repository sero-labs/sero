/**
 * Work records and artifacts (spec §19.1, §19.2).
 *
 * The WorkItem is deliberately small and its status is FREE-FORM. There is no
 * state machine here, and adding one would be a mistake: a Room decides its own
 * vocabulary ("drafting", "waiting on review", "merged"), and a fixed lifecycle
 * would force every Room through a review methodology the user never asked for.
 * The runtime's only interest in status is that the brief can show it.
 *
 * Two authority rules live here, both checked against the CALLER's member id
 * rather than against anything a message says (spec §18, §22):
 *
 *  - Only the Conductor may put work on another member. Anyone may create work,
 *    take work themselves, or update what a work item says.
 *  - An artifact's producer is stamped by the runtime from the caller. A member
 *    cannot publish "on behalf of" anyone.
 *
 * Artifact CONTENT goes through `host.writeArtifact` and only its reference is
 * kept in the Room, so a large report never lands in room.json.
 */

import type { RoomArtifact, RoomArtifactKind, WorkItem } from '../../shared/room-message-types';
import { TERMINAL_ROOM_STATUSES } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import type { BriefSources } from './room-brief';
import { timelineEvent } from './room-actions';
import type { RoomRecord } from './room-state';
import type { RoomStore, RoomTransaction } from './room-store';

/** Bounds that keep room.json small. A Room past either of these is not tracking, it is logging. */
export const MAX_WORK_ITEMS = 200;
export const MAX_ARTIFACTS = 200;
/** Bigger than this belongs in a file, which is what the artifact ref points at. */
export const MAX_ARTIFACT_BYTES = 256 * 1024;

const MAX_TITLE = 120;
const MAX_STATUS = 40;
const MAX_NOTES = 1000;

export interface WorkInput {
  /** Omitted ⇒ a new work item. */
  workId?: string;
  title?: string;
  /** Free-form. The runtime never interprets it. */
  status?: string;
  notes?: string;
  ownerMemberId?: string | null;
  dependsOnWorkIds?: string[];
  artifactRefs?: string[];
}

export interface ArtifactInput {
  kind: RoomArtifactKind;
  title: string;
  /** Stored through host.writeArtifact. Omit when `ref` names something external. */
  content?: string;
  /** An external reference — a pull-request URL, a branch, a commit. */
  ref?: string;
  relatedWorkId?: string | null;
}

/**
 * `duplicate` is not a failure: it says this exact command already ran and its
 * record stands. It sits with the deny codes because the answer to the caller
 * is the same — nothing new happened here.
 */
export type WorkDenyCode =
  | 'unknown-room'
  | 'room-finished'
  | 'not-a-member'
  | 'unknown-work'
  | 'no-title'
  | 'too-many-work-items'
  | 'unknown-dependency'
  | 'not-conductor'
  | 'duplicate';

export type ArtifactDenyCode =
  | 'unknown-room'
  | 'room-finished'
  | 'not-a-member'
  | 'no-title'
  | 'no-content'
  | 'too-large'
  | 'too-many-artifacts'
  | 'unknown-work'
  | 'duplicate';

export interface WorkAccepted {
  ok: true;
  item: WorkItem;
  created: boolean;
}

export interface ArtifactAccepted {
  ok: true;
  artifact: RoomArtifact;
}

export interface RecordDenied<Code> {
  ok: false;
  code: Code;
  message: string;
}

export type WorkResult = WorkAccepted | RecordDenied<WorkDenyCode>;
export type ArtifactResult = ArtifactAccepted | RecordDenied<ArtifactDenyCode>;

export interface RoomWorkContext {
  host: OrchestratorHost;
  store: RoomStore;
}

export interface RoomWork {
  /**
   * Creates a work item, or updates the one `input.workId` names. `commandId`
   * makes it exactly-once: the item and the key land in one store write, so a
   * retry can neither add a second item nor lose the first.
   */
  update(roomId: string, memberId: string, input: WorkInput, commandId?: string): Promise<WorkResult>;
  list(roomId: string): Promise<WorkItem[]>;
  publishArtifact(
    roomId: string,
    memberId: string,
    input: ArtifactInput,
    commandId?: string,
  ): Promise<ArtifactResult>;
  listArtifacts(roomId: string): Promise<RoomArtifact[]>;
  /** What the coordinator rebuilds the Room brief from. */
  briefSources(roomId: string): Promise<BriefSources>;
}

const clamp = (value: string, max: number): string => value.trim().slice(0, max);

function denied<Code>(code: Code, message: string): RecordDenied<Code> {
  return { ok: false, code, message };
}

type CallerCheck =
  | { ok: true; record: RoomRecord }
  | { ok: false; code: 'unknown-room' | 'room-finished' | 'not-a-member'; message: string };

/** The one precondition both records share: a live Room and an active caller. */
function checkCaller(record: RoomRecord | null, memberId: string): CallerCheck {
  if (!record) return { ok: false, code: 'unknown-room', message: 'That Room does not exist.' };
  if (TERMINAL_ROOM_STATUSES.includes(record.runtime.status)) {
    return { ok: false, code: 'room-finished', message: 'This Room has finished, so its records are closed.' };
  }
  const member = record.members.find((candidate) => candidate.id === memberId);
  if (!member || member.status === 'retired') {
    return { ok: false, code: 'not-a-member', message: `${memberId} is not an active member of this Room.` };
  }
  return { ok: true, record };
}

/**
 * Every record-dependent reason a publish is refused.
 *
 * Deliberately run twice: once before the content file is written, so a publish
 * already known to fail leaves nothing behind, and again inside the transaction,
 * which is the only authority. The pre-check may go stale between the two; the
 * transaction is what decides.
 */
function artifactRefusal(
  record: RoomRecord | null,
  memberId: string,
  relatedWorkId: string | null,
): RecordDenied<ArtifactDenyCode> | null {
  const check = checkCaller(record, memberId);
  if (!check.ok) return denied<ArtifactDenyCode>(check.code, check.message);
  if (check.record.artifacts.length >= MAX_ARTIFACTS) {
    return denied<ArtifactDenyCode>('too-many-artifacts', `This Room already holds ${MAX_ARTIFACTS} artifacts.`);
  }
  if (relatedWorkId && !check.record.work.some((item) => item.id === relatedWorkId)) {
    return denied<ArtifactDenyCode>('unknown-work', `There is no work item ${relatedWorkId}.`);
  }
  return null;
}

export function createRoomWork(ctx: RoomWorkContext): RoomWork {
  const { host, store } = ctx;

  function buildItem(record: RoomRecord, memberId: string, input: WorkInput, now: string): WorkItem {
    return {
      id: host.newId('work'),
      roomId: record.definition.id,
      title: clamp(input.title ?? '', MAX_TITLE),
      // Unassigned work is real: the Conductor can write the list before it
      // decides who does what.
      ownerMemberId: input.ownerMemberId === undefined ? memberId : input.ownerMemberId,
      status: clamp(input.status ?? 'open', MAX_STATUS),
      notes: clamp(input.notes ?? '', MAX_NOTES),
      dependsOnWorkIds: input.dependsOnWorkIds ?? [],
      artifactRefs: input.artifactRefs ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function mergeItem(existing: WorkItem, input: WorkInput, now: string): WorkItem {
    return {
      ...existing,
      title: input.title === undefined ? existing.title : clamp(input.title, MAX_TITLE),
      status: input.status === undefined ? existing.status : clamp(input.status, MAX_STATUS),
      notes: input.notes === undefined ? existing.notes : clamp(input.notes, MAX_NOTES),
      ownerMemberId: input.ownerMemberId === undefined ? existing.ownerMemberId : input.ownerMemberId,
      dependsOnWorkIds: input.dependsOnWorkIds ?? existing.dependsOnWorkIds,
      artifactRefs: input.artifactRefs ?? existing.artifactRefs,
      updatedAt: now,
    };
  }

  return {
    /**
     * Every check runs against the record the write lands on, inside one
     * serialized turn: a work item validated against a roster that has moved by
     * the time it is written is the same class of bug as a revision planned
     * against a stale envelope.
     */
    async update(roomId, memberId, input, commandId) {
      const now = host.now();
      const outcome = await store.transact<WorkResult>(roomId, commandId ?? null, (record) => {
        const nothing = (result: WorkResult): RoomTransaction<WorkResult> => ({ record: null, result });
        const check = checkCaller(record, memberId);
        if (!check.ok) return nothing(denied<WorkDenyCode>(check.code, check.message));

        const existing = input.workId ? record.work.find((item) => item.id === input.workId) : undefined;
        if (input.workId && !existing) {
          return nothing(denied<WorkDenyCode>('unknown-work', `There is no work item ${input.workId}.`));
        }
        if (!existing && !input.title?.trim()) {
          return nothing(denied<WorkDenyCode>('no-title', 'New work needs a title.'));
        }
        if (!existing && record.work.length >= MAX_WORK_ITEMS) {
          return nothing(
            denied<WorkDenyCode>('too-many-work-items', `This Room already tracks ${MAX_WORK_ITEMS} work items.`),
          );
        }
        // Assigning someone else is a coordination decision, so it is the
        // Conductor's. Taking work yourself, or leaving it unassigned, is not.
        const assignee = input.ownerMemberId;
        if (assignee !== undefined && assignee !== null && assignee !== memberId) {
          const caller = record.members.find((candidate) => candidate.id === memberId);
          if (!caller?.isConductor) {
            return nothing(denied<WorkDenyCode>('not-conductor', 'Only the Conductor can put work on another member.'));
          }
          if (!record.members.some((candidate) => candidate.id === assignee)) {
            return nothing(denied<WorkDenyCode>('not-a-member', `${assignee} is not a member of this Room.`));
          }
        }
        const unknown = (input.dependsOnWorkIds ?? []).find((id) => !record.work.some((item) => item.id === id));
        if (unknown) {
          return nothing(denied<WorkDenyCode>('unknown-dependency', `There is no work item ${unknown} to depend on.`));
        }

        const item = existing ? mergeItem(existing, input, now) : buildItem(record, memberId, input, now);
        return {
          record: {
            ...record,
            work: existing
              ? record.work.map((entry) => (entry.id === item.id ? item : entry))
              : [...record.work, item],
          },
          result: { ok: true, item, created: !existing },
        };
      });
      if (outcome.duplicate) {
        return denied<WorkDenyCode>('duplicate', 'That work update was already applied.');
      }
      const result = outcome.result;
      if (!result.ok) return result;
      await store.appendTimeline(roomId, [
        timelineEvent(
          host,
          roomId,
          'work',
          memberId,
          result.created ? `Work added: ${result.item.title}.` : `Work updated: ${result.item.title} (${result.item.status}).`,
          { workId: result.item.id, status: result.item.status, owner: result.item.ownerMemberId ?? 'unassigned' },
        ),
      ]);
      return result;
    },

    async list(roomId) {
      return (await store.readRoom(roomId))?.work ?? [];
    },

    async publishArtifact(roomId, memberId, input, commandId) {
      // Content is written BEFORE the transaction on purpose: a record naming a
      // file that does not exist loses the artifact, while a file nothing names
      // only wastes space the Room reclaims when it is deleted. So everything
      // that can refuse the publish is checked first, and nothing doomed writes.
      if (!input.title.trim()) return denied<ArtifactDenyCode>('no-title', 'An artifact needs a title.');
      if (input.content === undefined && !input.ref?.trim()) {
        return denied<ArtifactDenyCode>('no-content', 'An artifact needs either content or a reference.');
      }
      if (input.content !== undefined && Buffer.byteLength(input.content, 'utf8') > MAX_ARTIFACT_BYTES) {
        return denied<ArtifactDenyCode>('too-large', `An artifact can hold ${MAX_ARTIFACT_BYTES} bytes at most.`);
      }
      if (commandId && (await store.hasAppliedCommand(roomId, commandId))) {
        return denied<ArtifactDenyCode>('duplicate', 'That artifact was already published.');
      }
      const refusal = artifactRefusal(await store.readRoom(roomId), memberId, input.relatedWorkId ?? null);
      if (refusal) return refusal;

      const id = host.newId('artifact');
      // Content is stored under the Room's own directory, so deleting the Room
      // reclaims its artifacts with it.
      const ref =
        input.content === undefined
          ? (input.ref ?? '').trim()
          : await host.writeArtifact(`rooms/${roomId}/artifacts/${id}.md`, input.content);
      const artifact: RoomArtifact = {
        id,
        roomId,
        kind: input.kind,
        title: clamp(input.title, MAX_TITLE),
        ref,
        // Stamped from the caller, never from the request.
        producedByMemberId: memberId,
        relatedWorkId: input.relatedWorkId ?? null,
        createdAt: host.now(),
      };

      const outcome = await store.transact<ArtifactResult>(roomId, commandId ?? null, (record) => {
        const refused = artifactRefusal(record, memberId, artifact.relatedWorkId);
        if (refused) return { record: null, result: refused };
        return {
          record: {
            ...record,
            artifacts: [...record.artifacts, artifact],
            // A related work item carries the reference too, so a member reading
            // its own work sees what it produced without scanning the Room.
            work: record.work.map((item) =>
              item.id === artifact.relatedWorkId ? { ...item, artifactRefs: [...item.artifactRefs, ref] } : item,
            ),
          },
          result: { ok: true, artifact },
        };
      });
      if (outcome.duplicate) {
        return denied<ArtifactDenyCode>('duplicate', 'That artifact was already published.');
      }
      if (!outcome.result.ok) return outcome.result;
      await store.appendTimeline(roomId, [
        timelineEvent(host, roomId, 'artifact', memberId, `Published ${artifact.kind}: ${artifact.title}.`, {
          artifactId: artifact.id,
          kind: artifact.kind,
          ref: artifact.ref,
        }),
      ]);
      return outcome.result;
    },

    async listArtifacts(roomId) {
      return (await store.readRoom(roomId))?.artifacts ?? [];
    },

    async briefSources(roomId) {
      const record = await store.readRoom(roomId);
      // Open questions stay empty here on purpose: the question text lives in
      // the paged message log, and reading pages on every brief rebuild would
      // cost more than the line it produces. The mailbox owns that seam.
      return { work: record?.work ?? [], artifacts: record?.artifacts ?? [], openQuestions: [] };
    },
  };
}
