/**
 * The AD-020 Room command router (spec §18).
 *
 * One entry point for every logical Room operation. The extension registers a
 * single handler, Sero bridges it through `sero-cli`, and this decides what the
 * operation means. A member never receives a tool schema per operation — fifteen
 * schemas on every turn of every member would be a per-turn tax paid by the
 * whole Room, for a surface that changes rarely.
 *
 * Three rules hold the file together:
 *
 *  - **The caller is resolved, never declared.** `resolveRoomCaller` matches the
 *    live session against the roster. An `as` argument is only ever CHECKED
 *    against that; it can never become the answer. Without this, "I am the
 *    Conductor" in a tool argument would be enough to change the Room.
 *
 *  - **Nothing is implemented here.** Messaging is the mailbox, revisions are
 *    `applyRoomRevision`, claims are `room-claims`, work and artifacts are
 *    `room-work`, finishing is the coordinator. This file resolves, validates
 *    and routes.
 *
 *  - **A refusal is an answer.** Every deny path returns plain English the
 *    member can act on, because the member's next turn is the only place the
 *    mistake can be corrected.
 */

import {
  ROOM_COMMANDS,
  validateRoomCommand,
  type RoomCommandId,
} from '../../shared/room-commands';
import type { RoomArtifactKind } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import type { RoomClaims } from './room-claims';
import {
  collectRoomCommits,
  finishRoomWithDelivery,
  requestDeliverySend,
  type RoomDeliveryCommandDeps,
} from './room-command-delivery';
import { renderArtifact, renderClaims, renderMandate, renderRoster } from './room-command-text';
import type { MailboxResult, RoomMailbox } from './room-mailbox';
import { timelineEvent, withMember, withMemberStatus, withRoomStatus } from './room-actions';
import type { RoomRevisionProposal } from '../../shared/room-revision-types';
import type { RevisionResult } from './room-revisions';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';
import type { RoomWork } from './room-work';

/**
 * What the runtime knows about the caller before the roster is consulted. Both
 * fields come from the host — the session file the member is running in, and
 * the directory the call arrived with. Neither is model-authored.
 */
export interface RoomCallerSignals {
  sessionPath?: string | null;
  cwd?: string | null;
}

/** Flat command payload. One shape for every operation, as the bridge delivers it. */
export interface RoomCommandInput {
  command: string;
  /** Idempotency key (NFR-003). Minted when the caller does not supply one. */
  commandId?: string;
  /** The caller's claim about who it is. CHECKED against the roster, never trusted. */
  as?: string;
  to?: string[];
  body?: string;
  questionId?: string;
  /** send/broadcast only: ask to wake idle recipients. Policy still decides. */
  wake?: boolean;
  /** ask only: carry on instead of waiting for the answer. */
  keepWorking?: boolean;
  memberId?: string;
  workId?: string;
  title?: string;
  status?: string;
  notes?: string;
  dependsOn?: string[];
  paths?: string[];
  reason?: string;
  artifactKind?: RoomArtifactKind;
  /** request-delivery-approval only: the exact payload the send will carry. */
  content?: string;
  /** finish-room only: the approval that authorised an external send. */
  approvalId?: string;
  ref?: string;
  relatedWorkId?: string;
  task?: string;
  priorities?: string[];
  instructions?: string;
  proposal?: RoomRevisionProposal;
  summary?: string;
}

export interface RoomCommandOutcome {
  ok: boolean;
  /** Plain English for the member that ran the command. */
  text: string;
  details: Record<string, unknown>;
}

/** Everything the router routes TO. Each one already exists; none is built here. */
export interface RoomCommandDeps extends RoomDeliveryCommandDeps {
  store: RoomStore;
  mailbox: RoomMailbox;
  claims: RoomClaims;
  work: RoomWork;
  /** `applyRoomRevision` with its deps already bound (host, store, mutate, notify). */
  applyRevision(input: {
    roomId: string;
    proposal: RoomRevisionProposal;
    actorMemberId: string;
    reason: string;
    commandId: string;
  }): Promise<RevisionResult>;
  /** The coordinator's own operations. Nothing else may drive a Room. */
  publishConductorNote(roomId: string, note: string): Promise<void>;
  noteStructuralProgress(roomId: string, summary: string): Promise<void>;
}

export interface RoomCaller {
  roomId: string;
  member: RoomMember;
}

const ok = (text: string, details: Record<string, unknown> = {}): RoomCommandOutcome => ({ ok: true, text, details });
const no = (text: string, details: Record<string, unknown> = {}): RoomCommandOutcome => ({ ok: false, text, details });

function fromMailbox(result: MailboxResult, done: string): RoomCommandOutcome {
  if (!result.ok) return no(result.message, { code: result.code });
  if (result.duplicate) return ok(result.note ?? 'That was already sent, so nothing was sent again.', { duplicate: true });
  const extras = [
    result.wokeMemberIds.length > 0 ? `Woke ${result.wokeMemberIds.length} member(s).` : null,
    result.skipped.length > 0 ? `Skipped ${result.skipped.length}: ${result.skipped[0].reason}` : null,
    result.note,
  ].filter((line): line is string => line !== null);
  return ok([done, ...extras].join(' '), { messageIds: result.messages.map((message) => message.id) });
}

/**
 * Which member is calling, decided from the host's own view of the session.
 *
 * The session file is the strong signal: the host bound it to one subject when
 * it created it, and a member cannot write another member's path into its own
 * session. The worktree is the fallback, because a grant pins an editing member
 * to exactly one directory. A member that matches neither is not addressed as a
 * member at all, and gets no Room command.
 */
export async function resolveRoomCaller(
  store: RoomStore,
  signals: RoomCallerSignals,
): Promise<RoomCaller | null> {
  const state = await store.readState();
  const sessionPath = signals.sessionPath?.trim();
  const cwd = signals.cwd?.replace(/\/+$/, '');
  for (const record of state.rooms) {
    for (const member of record.members) {
      if (member.status === 'retired') continue;
      const bySession = sessionPath && member.session.sessionPath === sessionPath;
      const byWorktree = cwd && member.worktreePath && member.worktreePath.replace(/\/+$/, '') === cwd;
      if (bySession || byWorktree) return { roomId: record.definition.id, member };
    }
  }
  return null;
}

export function createRoomCommandRouter(deps: RoomCommandDeps) {
  const { host, store } = deps;

  /** Blocks or unblocks the caller, recomputing the Room's active slots in the same write. */
  function setCallerStatus(
    roomId: string,
    memberId: string,
    status: RoomMember['status'],
    detail: string,
  ): Promise<void> {
    return store.updateRoom(roomId, (record) =>
      withRoomStatus(
        withMember(record, memberId, (member) => withMemberStatus(member, status, detail)),
        record.runtime.status,
        host.now(),
      ),
    );
  }

  /**
   * NFR-003, audited across ROOM_COMMANDS. Every command is in one of three
   * groups, and nothing is left over:
   *
   *  - **Read-only** — show-roster, show-mandate. No key, nothing to repeat.
   *  - **Keyed** — send-message, broadcast, ask, reply, update-work,
   *    publish-artifact, update-mandate, propose-revision,
   *    request-delivery-approval. Each of these can create a SECOND record on a
   *    retry, so each one hands its key to the module that owns the write, and
   *    that module persists the record and the key in a single store write.
   *  - **Idempotent by construction** — wait, claim-paths, release-paths,
   *    report-status, request-attention, publish-note, collect-commits,
   *    finish-room. Each writes a value rather than appending one (a status, a
   *    block, a note, a claim keyed by its own pattern, a checkpoint of what is
   *    uncommitted, a terminal Room status), so running it twice leaves the Room
   *    exactly as running it once did. A key would buy nothing.
   */
  async function run(
    caller: RoomCaller,
    record: RoomRecord,
    input: RoomCommandInput,
    command: RoomCommandId,
    commandId: string,
  ): Promise<RoomCommandOutcome> {
    const { roomId, member } = caller;
    const body = input.body?.trim() ?? '';
    const to = input.to ?? [];

    switch (command) {
      case 'show-roster':
        return ok(renderRoster(record, member));

      case 'show-mandate': {
        const target = input.memberId
          ? record.members.find((candidate) => candidate.id === input.memberId)
          : member;
        return target ? ok(renderMandate(target)) : no(`There is no member ${input.memberId} in this Room.`);
      }

      case 'send-message':
        if (to.length === 0) return no('Name at least one member to send to (see show-roster).');
        return fromMailbox(
          await deps.mailbox.send(roomId, { commandId, fromMemberId: member.id, body, toMemberIds: to, requestResponse: input.wake }),
          'Message sent.',
        );

      case 'broadcast':
        return fromMailbox(
          await deps.mailbox.broadcast(roomId, { commandId, fromMemberId: member.id, body, wakeRecipients: input.wake }),
          'Broadcast queued for the Room.',
        );

      case 'ask': {
        if (to.length === 0) return no('Name the member you are asking (see show-roster).');
        // Waiting is the default because guessing is the failure this command
        // exists to prevent. A Conductor asking several members at once is the
        // case that needs to keep working.
        const waitForReply = input.keepWorking !== true;
        return fromMailbox(
          await deps.mailbox.ask(roomId, { commandId, fromMemberId: member.id, body, toMemberIds: to, waitForReply }),
          waitForReply
            ? 'Question asked. Your turn ends here and resumes when the answer arrives.'
            : 'Question asked. The answer will reach you on a later turn.',
        );
      }

      case 'reply':
        if (!input.questionId) return no('Name the question you are answering.');
        return fromMailbox(
          await deps.mailbox.reply(roomId, { commandId, fromMemberId: member.id, body, questionId: input.questionId }),
          'Answer sent.',
        );

      case 'wait': {
        if (!input.questionId) return no('Name the question you are waiting on.');
        const result = await deps.mailbox.wait(roomId, member.id, input.questionId);
        return result.ok
          ? ok('Waiting. Your turn ends here and resumes when the answer arrives.')
          : no(result.message, { code: result.code });
      }

      case 'update-work': {
        const result = await deps.work.update(
          roomId,
          member.id,
          {
            workId: input.workId,
            title: input.title,
            ownerMemberId: input.memberId,
            status: input.status,
            notes: input.notes,
            dependsOnWorkIds: input.dependsOn,
          },
          commandId,
        );
        if (!result.ok) {
          return result.code === 'duplicate'
            ? ok(result.message, { duplicate: true })
            : no(result.message, { code: result.code });
        }
        // Work moving IS structural progress (§21), and it is the coordinator
        // that decides what progress means for the brief and the idle ladder.
        await deps.noteStructuralProgress(roomId, `${member.displayName}: ${result.item.title} (${result.item.status}).`);
        return ok(
          `${result.created ? 'Added' : 'Updated'} "${result.item.title}" [${result.item.id}] — ${result.item.status}.`,
          { workId: result.item.id },
        );
      }

      case 'publish-artifact': {
        if (!input.artifactKind) return no('Say what kind of artifact this is (plan, decision, commit, review, report, …).');
        const result = await deps.work.publishArtifact(
          roomId,
          member.id,
          {
            kind: input.artifactKind,
            title: input.title ?? '',
            content: input.body || undefined,
            ref: input.ref,
            relatedWorkId: input.relatedWorkId,
          },
          commandId,
        );
        if (!result.ok) {
          return result.code === 'duplicate'
            ? ok(result.message, { duplicate: true })
            : no(result.message, { code: result.code });
        }
        await deps.noteStructuralProgress(roomId, `${member.displayName} published ${result.artifact.kind}: ${result.artifact.title}.`);
        return ok(renderArtifact(result.artifact), { artifactId: result.artifact.id, ref: result.artifact.ref });
      }

      case 'claim-paths': {
        if (!input.paths?.length) return no('Name the paths, directories or globs you are claiming.');
        const result = await deps.claims.claim(roomId, member.id, input.paths, input.reason ?? body);
        if (!result.ok) return no(result.message, { code: result.code, overlaps: result.overlaps });
        return ok([renderClaims(record, result.claims), result.warning].filter(Boolean).join(' '), {
          claimIds: result.claims.map((claim) => claim.id),
        });
      }

      case 'release-paths': {
        const released = await deps.claims.release(roomId, member.id, input.paths);
        return ok(
          released.length > 0
            ? `Released ${released.length} path(s): ${released.map((claim) => claim.pattern).join(', ')}.`
            : 'You were not holding any of those paths.',
          { released: released.length },
        );
      }

      case 'report-status': {
        if (!body) return no('Say what your status is.');
        // A status line is NOT progress (§21): a Room that only talks about its
        // work must still reach the no-progress ladder.
        await store.updateMember(roomId, member.id, (current) => ({ ...current, statusDetail: body.slice(0, 300) }));
        await store.appendTimeline(roomId, [
          timelineEvent(host, roomId, 'member-status', member.id, `${member.displayName}: ${body.slice(0, 300)}`),
        ]);
        return ok('Status recorded for the Room.');
      }

      case 'request-attention': {
        if (!body) return no('Say what you need from the user.');
        // The member stops rather than guessing, and holds no execution slot
        // while it waits. Only the user (or the Conductor messaging it) can
        // restart it — a peer message cannot answer for the user (§22).
        await setCallerStatus(roomId, member.id, 'blocked', `Needs the user: ${body.slice(0, 300)}`);
        await store.appendTimeline(roomId, [
          timelineEvent(host, roomId, 'approval', member.id, `${member.displayName} needs the user: ${body.slice(0, 300)}`),
        ]);
        host.notify(`${record.definition.title}: ${member.displayName} needs you — ${body.slice(0, 200)}`, 'warning');
        return ok('The user was asked. You are stopped until they answer.');
      }

      case 'publish-note':
        if (!body) return no('A situation note needs something in it.');
        await deps.publishConductorNote(roomId, body);
        return ok('Note published to the Room brief.');

      case 'update-mandate': {
        if (!input.memberId) return no('Name the member whose mandate you are changing.');
        const proposal: RoomRevisionProposal = input.task
          ? { kind: 'assign-work', memberId: input.memberId, task: input.task, priorities: input.priorities }
          : {
              kind: 'update-mandate',
              memberId: input.memberId,
              mandate: {
                responsibilities: input.notes,
                currentTask: input.task,
                priorities: input.priorities,
                workingInstructions: input.instructions,
              },
            };
        return fromRevision(await deps.applyRevision({ roomId, proposal, actorMemberId: member.id, reason: input.reason ?? body, commandId }));
      }

      case 'propose-revision':
        if (!input.proposal) return no('Describe the revision you are proposing.');
        return fromRevision(
          await deps.applyRevision({ roomId, proposal: input.proposal, actorMemberId: member.id, reason: input.reason ?? body, commandId }),
        );

      case 'collect-commits':
        return collectRoomCommits(deps, roomId, member.id);

      case 'request-delivery-approval':
        return requestDeliverySend(deps, roomId, member.id, input, commandId);

      case 'finish-room': {
        const summary = input.summary?.trim() || body;
        if (!summary) return no('A Room finishes with its final answer. Say what it is.');
        // Completing closes every session, including the Conductor's own. The
        // Room is over, so losing this answer's delivery back into a dead
        // session costs nothing — the result is already persisted and delivered.
        return finishRoomWithDelivery(deps, record, input, summary);
      }
    }
  }

  function fromRevision(result: RevisionResult): RoomCommandOutcome {
    switch (result.outcome) {
      case 'applied':
        return ok(result.revision.summary, { revisionId: result.revision.id });
      case 'awaiting-approval':
        return ok(`${result.approval.title} The user has to approve that, so nothing has changed yet.`, {
          approvalId: result.approval.id,
        });
      case 'duplicate':
        return ok('That change was already made.', { duplicate: true });
      case 'refused':
        return no(result.reason);
    }
  }

  return {
    /** Whether this workspace's Rooms hold the calling member (registry routing). */
    owns: async (signals: RoomCallerSignals): Promise<boolean> =>
      (await resolveRoomCaller(store, signals)) !== null,

    /**
     * Resolves the caller, checks its authority, and routes. The Room is taken
     * from the RESOLVED member, so a caller cannot address a Room it is not in.
     */
    async execute(signals: RoomCallerSignals, input: RoomCommandInput): Promise<RoomCommandOutcome> {
      const known = ROOM_COMMANDS.find((candidate) => candidate.id === input.command);
      if (!known) {
        return no(`"${input.command}" is not a Room command. Available: ${ROOM_COMMANDS.map((c) => c.id).join(', ')}.`);
      }
      const caller = await resolveRoomCaller(store, signals);
      if (!caller) return no('Room commands are for Room members, and this session is not one.');

      const record = await store.readRoom(caller.roomId);
      if (!record) return no('This Room is gone.');

      // Minted rather than required: a fresh call is a new action, and a model
      // cannot invent a key that is stable across a retry. A caller that wants
      // true retry safety passes its own key and gets exact-once behaviour.
      const commandId = input.commandId?.trim() || host.newId('cmd');
      const verdict = validateRoomCommand(
        { command: input.command, commandId, actorMemberId: input.as?.trim() || caller.member.id },
        { memberId: caller.member.id, isConductor: caller.member.isConductor },
      );
      if (!verdict.ok) return no(verdict.message, { code: verdict.code });

      return run(caller, record, input, known.id, commandId);
    },
  };
}

export type RoomCommandRouter = ReturnType<typeof createRoomCommandRouter>;
