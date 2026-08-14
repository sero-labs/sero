/**
 * Pure Room record transitions, and the text one member's turn carries.
 *
 * The coordinator owns WHEN state changes; this file owns WHAT the changed
 * record looks like. Keeping the two apart is what makes lifecycle and turn
 * composition testable without a store, a clock or a model.
 *
 * Member-level records are NOT built here: `member-grant.ts` owns the
 * blueprint→member projection and `member-turn.ts` owns turn bookkeeping, so a
 * member's authority has exactly one source.
 *
 * Every function returns a new record and touches nothing else — the store
 * diffs members by value and Rooms by reference, so an unchanged member must
 * come back as the object it went in as.
 */

import type { RoomBlueprint, RoomProposalSummary } from '../../shared/room-blueprint-types';
import type { RoomMessage, RoomTimelineEvent } from '../../shared/room-message-types';
import type { MemberStatus, RoomMember, RoomStatus, RoomStopReason } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import { toMemberRecord } from './member-grant';
import { buildRoomBrief, type BriefSources } from './room-brief';
import type { RoomRecord } from './room-state';

/** Phase 5 supplies the real work, artifacts and questions. Until then, none exist. */
export const EMPTY_BRIEF_SOURCES: BriefSources = { work: [], artifacts: [], openQuestions: [] };

export interface CreateRoomRequest {
  /** The user's own words, kept verbatim for the audit trail. */
  problemStatement: string;
  /** Already planned, validated and clamped (planner.ts / adjust.ts). */
  blueprint: RoomBlueprint;
  /** Computed from the same blueprint. Never planner-authored. */
  proposal: RoomProposalSummary;
  workspaceId: string;
  /** Set when the Room was started from a chat, so its result can go back there. */
  originSessionId?: string | null;
  deliveryParams?: Record<string, string | number | boolean>;
  /**
   * Keeps an existing Room's identity when its draft is re-planned. Minted when
   * absent. A user adjusting a proposal is still looking at the same Room, and
   * the roster is stamped with the id, so it cannot simply be patched in after.
   */
  id?: string;
}

/** A draft Room: members exist and are addressable, but nothing runs and no grant is held. */
export function buildRoomRecord(host: OrchestratorHost, request: CreateRoomRequest): RoomRecord {
  const now = host.now();
  const id = request.id ?? host.newId('room');
  const members = request.blueprint.members.map((member) => ({
    ...toMemberRecord(member, id, now, request.workspaceId),
    // `starting` holds an execution slot, so a roster that has not started yet
    // would consume the Room's whole concurrency budget before the first turn.
    // A drafted member is offline; Start makes it idle.
    status: 'offline' as MemberStatus,
    statusDetail: 'Waiting for the Room to start.',
  }));
  const base: RoomRecord = {
    definition: {
      id,
      title: request.blueprint.title,
      problemStatement: request.problemStatement,
      blueprint: request.blueprint,
      proposal: request.proposal,
      envelope: request.blueprint.envelope,
      workspacePolicy: request.blueprint.workspacePolicy,
      // Issued at Start, from the user's approval — never at draft time.
      grantId: null,
      createdAt: now,
      updatedAt: now,
    },
    runtime: {
      status: 'draft',
      startedAt: null,
      endedAt: null,
      activeMemberIds: [],
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0, turns: 0, rosterRevisions: 0, memberReplacements: 0 },
      stopReason: null,
      messageSequence: 0,
      timelineSequence: 0,
      appliedCommandIds: [],
      lastProgressAt: null,
    },
    members,
    brief: {
      objective: request.blueprint.objective,
      successCriteria: request.blueprint.successCriteria,
      decisions: [],
      activeWork: [],
      blockers: [],
      openQuestions: [],
      artifactRefs: [],
      updatedAt: now,
      conductorNote: null,
      conductorNoteAt: null,
    },
    delivery: {
      destination: request.blueprint.deliveryDestination,
      params: request.deliveryParams ?? {},
      originSessionId: request.originSessionId ?? null,
      originWorkspaceId: request.originSessionId ? request.workspaceId : null,
      deliveredAt: null,
      deliveryRef: null,
    },
    archivedAt: null,
    revisions: [],
    readCursors: [],
    approvals: [],
    work: [],
    artifacts: [],
    claims: [],
  };
  // Built through the function every later rebuild uses, so a draft brief and a
  // running brief can never be computed two different ways.
  return { ...base, brief: buildRoomBrief(base, EMPTY_BRIEF_SOURCES, now) };
}

export function withMember(
  record: RoomRecord,
  memberId: string,
  apply: (member: RoomMember) => RoomMember,
): RoomRecord {
  return { ...record, members: record.members.map((member) => (member.id === memberId ? apply(member) : member)) };
}

export function withMemberStatus(member: RoomMember, status: MemberStatus, detail: string): RoomMember {
  return { ...member, status, statusDetail: detail };
}

/** Derived, never accumulated: a stale id in this list would fake a held slot. */
function activeIds(members: RoomMember[]): string[] {
  return members.filter((member) => member.status === 'working' || member.status === 'starting').map((m) => m.id);
}

export function withRoomStatus(
  record: RoomRecord,
  status: RoomStatus,
  now: string,
  stopReason: RoomStopReason | null = record.runtime.stopReason,
): RoomRecord {
  const ended = status === 'completed' || status === 'failed' || status === 'cancelled';
  return {
    ...record,
    definition: { ...record.definition, updatedAt: now },
    runtime: {
      ...record.runtime,
      status,
      startedAt: record.runtime.startedAt ?? (status === 'ready' || status === 'running' ? now : null),
      endedAt: ended ? record.runtime.endedAt ?? now : record.runtime.endedAt,
      activeMemberIds: activeIds(record.members),
      stopReason,
    },
  };
}

/** Reasons only structural progress clears — taking another turn is not progress. */
const LADDER_REASONS: readonly RoomStopReason['kind'][] = ['no-progress', 'deadlock'];

/** Drops a stop reason that structural progress has now answered. */
export function clearLadderReason(record: RoomRecord): RoomRecord {
  const reason = record.runtime.stopReason;
  if (!reason || !LADDER_REASONS.includes(reason.kind)) return record;
  return { ...record, runtime: { ...record.runtime, stopReason: null } };
}

/**
 * Marks the selected members as holding a slot, inside the Room lock and before
 * any turn actually runs.
 *
 * Without this write a second pass, triggered while the first one's turns were
 * still opening their sessions, would read those members as idle and start more
 * than the approved concurrency.
 */
export function markTurnsStarted(record: RoomRecord, memberIds: string[], now: string): RoomRecord {
  const started = new Set(memberIds);
  const members = record.members.map((member) =>
    started.has(member.id)
      ? { ...withMemberStatus(member, 'working', 'Working.'), waitingOnQuestionId: null }
      : member,
  );
  // A ladder reason survives: a Room that keeps taking turns while nothing
  // progresses is exactly the failure the ladder exists to catch, so only real
  // progress may clear it. Anything else is spent once the Room moves again.
  const reason = record.runtime.stopReason;
  const kept = reason && LADDER_REASONS.includes(reason.kind) ? reason : null;
  return withRoomStatus({ ...record, members }, 'running', now, kept);
}

function renderMessage(record: RoomRecord, message: RoomMessage): string {
  const from = record.members.find((member) => member.id === message.fromMemberId);
  const question = message.questionId ? ` [question ${message.questionId}]` : '';
  return `- ${from ? from.displayName : 'Room'} (${message.kind})${question}: ${message.body}`;
}

/**
 * The turn-specific half of a member's prompt: its current task, its priorities
 * and the messages addressed to it since it last ran. The brief projection is
 * prepended by `runMemberTurn`, the Room protocol is loaded with the session
 * (`buildMemberPromptAdditions`), and the Room transcript is never part of any
 * of them (NFR-002).
 */
export function renderTurnRequest(record: RoomRecord, member: RoomMember, messages: RoomMessage[]): string {
  const lines: string[] = [];
  if (member.mandate.currentTask.trim()) lines.push('## Your current task', member.mandate.currentTask, '');
  if (member.mandate.priorities.length > 0) {
    lines.push('## Priorities', ...member.mandate.priorities.map((priority) => `- ${priority}`), '');
  }
  if (messages.length > 0) {
    lines.push('## New messages', ...messages.map((message) => renderMessage(record, message)), '');
  }
  lines.push(
    messages.length > 0
      ? 'Answer what you were asked, then continue your own work.'
      : 'Continue your work. Ask the Room when you need something you cannot get yourself.',
  );
  return lines.join('\n');
}

/**
 * Who is waiting on whom (FR-020). The edge runs from the member that asked to
 * the members that owe it an answer, which is what makes a cycle mean "nobody
 * in this set can proceed".
 */
export function buildWaitEdges(
  record: RoomRecord,
  messages: RoomMessage[],
): { fromMemberId: string; toMemberId: string }[] {
  const edges: { fromMemberId: string; toMemberId: string }[] = [];
  for (const member of record.members) {
    if (member.status !== 'waiting' || !member.waitingOnQuestionId) continue;
    const question = messages.find((message) => message.questionId === member.waitingOnQuestionId);
    if (!question) continue;
    for (const toMemberId of question.toMemberIds) edges.push({ fromMemberId: member.id, toMemberId });
  }
  return edges;
}

export function timelineEvent(
  host: OrchestratorHost,
  roomId: string,
  kind: RoomTimelineEvent['kind'],
  memberId: string | null,
  summary: string,
  details: RoomTimelineEvent['details'] = null,
): RoomTimelineEvent {
  return { id: host.newId('evt'), roomId, at: host.now(), kind, memberId, summary, details };
}
