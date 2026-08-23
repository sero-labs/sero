/**
 * What one member's turn is asked to do, and the messages it carries (§17.1).
 *
 * The batch is LEASED, not consumed. The read cursor moves only when the
 * session has taken the prompt onto its transcript, so an interrupted delivery
 * leaves the batch outstanding and restart recovery hands it over again. A
 * message can arrive twice; it is never marked read by a turn that never saw it.
 */

import type { WorkItem } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';
import type { MemberSessionPool, MemberTurnResult } from './member-session';
import { renderTurnRequest } from './room-actions';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';

/** Messages handed to one member at the start of its turn. */
export const MAX_MESSAGES_PER_TURN = 20;

export interface MemberPromptDeps {
  host: OrchestratorHost;
  store: RoomStore;
  sessions: MemberSessionPool;
}

export interface MemberPromptOptions {
  /** Post-compaction context this turn must carry, if the member has one owed. */
  reprime?: string;
  work?: WorkItem[];
  signal?: AbortSignal;
}

/** Runs one member's turn with its leased messages, and commits them on acceptance. */
export async function promptMemberTurn(
  deps: MemberPromptDeps,
  record: RoomRecord,
  member: RoomMember,
  options: MemberPromptOptions,
): Promise<MemberTurnResult> {
  const roomId = record.definition.id;
  const lease = await deps.store.leaseMessagesFor(roomId, member.id, MAX_MESSAGES_PER_TURN);
  const request = renderTurnRequest(record, member, lease.messages);
  const prompt = options.reprime ? `${options.reprime}\n\n${request}` : request;

  return deps.sessions
    .runTurn(record, member, {
      prompt,
      work: options.work,
      signal: options.signal,
      onAccepted: () =>
        deps.store.acknowledgeMessages(roomId, member.id, lease.throughSequence).catch((error: unknown) =>
          // A lost acknowledgement costs one redelivery. Failing the turn over it
          // would throw away work the session has already started.
          deps.host.log(`room ${roomId}: ${member.id} could not acknowledge its messages: ${String(error)}`),
        ),
    })
    .catch((error: unknown) => ({
      turnId: null,
      status: 'error' as const,
      detail: error instanceof Error ? error.message : String(error),
      usage: null,
    }));
}
