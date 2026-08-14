/**
 * The mailbox contract: what a member may ask the Room to send, and what it is
 * told back (spec §17, §18).
 *
 * Split from the implementation because the AD-020 command bridge speaks these
 * shapes too. Every request carries its own idempotency key and the caller id
 * the RUNTIME resolved from the roster — never an identity taken from prompt
 * text.
 */

import type { RoomMessage } from '../../shared/room-message-types';
import type { OrchestratorHost } from '../host';
import type { MailboxLimits, SkippedRecipient } from './room-mailbox-limits';
import type { WakeReason } from './room-scheduler';
import type { RoomStore } from './room-store';

export type MailboxDenyCode =
  | 'unknown-room'
  | 'room-finished'
  | 'not-a-member'
  | 'body-empty'
  | 'body-too-long'
  | 'rate-limited'
  | 'unknown-recipient'
  | 'no-recipients'
  | 'inbox-full'
  | 'unknown-question'
  | 'not-your-question';

export interface MailboxDenied {
  ok: false;
  code: MailboxDenyCode;
  /** Plain English. This is what the member is told, so it can correct itself. */
  message: string;
}

export interface MailboxDelivered {
  ok: true;
  /** True when this command id was already applied and nothing new was written. */
  duplicate: boolean;
  messages: RoomMessage[];
  /** Members resumed through the coordinator's event path. */
  wokeMemberIds: string[];
  skipped: SkippedRecipient[];
  /** Set when the caller asked for something policy refused, e.g. a broadcast wake. */
  note: string | null;
}

export type MailboxResult = MailboxDelivered | MailboxDenied;

/** Every mailbox command carries its idempotency key and its resolved caller. */
export interface MailboxCommand {
  /** Idempotency key (NFR-003). A retry never creates a second logical message. */
  commandId: string;
  /** Resolved by the runtime from the roster — never taken from prompt text. */
  fromMemberId: string;
  body: string;
}

export interface SendRequest extends MailboxCommand {
  toMemberIds: string[];
  /** Wakes idle recipients. A busy recipient still queues — no steering (§17.2). */
  requestResponse?: boolean;
}

export interface BroadcastRequest extends MailboxCommand {
  /** Honoured only when the broadcast-wake policy also permits it (FR-021). */
  wakeRecipients?: boolean;
}

export interface AskRequest extends MailboxCommand {
  toMemberIds: string[];
  /** Default true: asking ends the asker's turn and releases its slot. */
  waitForReply?: boolean;
}

export interface ReplyRequest extends MailboxCommand {
  questionId: string;
}

export interface CancelRequest extends MailboxCommand {
  questionId: string;
}

export interface AcknowledgeRequest extends MailboxCommand {
  toMemberIds: string[];
}

export interface RoomMailboxContext {
  host: OrchestratorHost;
  store: RoomStore;
  /** The coordinator's own wake seam. The mailbox never schedules directly. */
  wake(roomId: string, memberId: string, reason: WakeReason): Promise<void>;
  /** Raised when waiting members form a cycle. The coordinator owns the ladder. */
  onWaitCycle?(roomId: string, cycles: string[][]): Promise<void>;
  limits?: Partial<MailboxLimits>;
}

export interface RoomMailbox {
  send(roomId: string, request: SendRequest): Promise<MailboxResult>;
  broadcast(roomId: string, request: BroadcastRequest): Promise<MailboxResult>;
  ask(roomId: string, request: AskRequest): Promise<MailboxResult>;
  reply(roomId: string, request: ReplyRequest): Promise<MailboxResult>;
  /** Withdraws a question, by the member that asked it or by the Conductor. */
  cancel(roomId: string, request: CancelRequest): Promise<MailboxResult>;
  acknowledge(roomId: string, request: AcknowledgeRequest): Promise<MailboxResult>;
  /** Blocks a member on a question it already asked (the `wait` command). */
  wait(roomId: string, memberId: string, questionId: string): Promise<MailboxResult>;
  /** Wait cycles among the members currently blocked (FR-020). */
  detectDeadlock(roomId: string): Promise<string[][]>;
  forget(roomId: string): void;
}
