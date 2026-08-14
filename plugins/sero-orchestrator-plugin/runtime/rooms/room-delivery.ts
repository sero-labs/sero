/**
 * The Room approval inbox and the return to the invoking chat (spec §22, §23,
 * FR-026, FR-029).
 *
 * Two jobs that belong together because both are about the boundary between a
 * Room and its user:
 *
 *  1. **Approvals.** `room-revisions.ts` already decides what needs the user and
 *     records it. This file SURFACES those records — one queue covering every
 *     member of every Room, in the same watched-index payload the Workflow
 *     inbox reads — and owns the one rule the record cannot enforce on its own:
 *     only the USER resolves an approval. A member (including the Conductor)
 *     answering its own request would make the approval a formality (§22).
 *
 *  2. **Delivery.** A Room that started from a chat owes that chat one result.
 *     The runtime composes it from the Room's own computed records and sends it
 *     through the existing session seam. An external destination stays under
 *     the Workflow rule: the send is the agent's, and the runtime accepts it
 *     only with a `DeliveryReceipt` naming an APPROVED external-write approval
 *     that is BOUND to this payload and this destination, and is spent by the
 *     delivery that used it (`room-delivery-binding.ts`).
 *
 * Nothing here writes a Room record directly: every write goes through the
 * store, which is the single writer.
 */

import {
  deliveryDestinationInfo,
  isDeliveryDestinationId,
  isExternalDestination,
  type DeliveryReceipt,
} from '../../shared/delivery-types';
import type { RoomAttention, RoomAttentionApproval } from '../../shared/attention-types';
import { ROOM_ACCESS_LABEL_TEXT } from '../../shared/room-access-map';
import type { RoomApprovalRequest } from '../../shared/room-message-types';
import type { OrchestratorHost } from '../host';
import {
  buildDeliveryBinding,
  externalTokenProblems,
  withApprovalConsumed,
} from './room-delivery-binding';
import { applyRevisionToRoom } from './room-revision-mutate';
import type { RoomRecord } from './room-state';
import type { RoomStore } from './room-store';
import { resolveRoomApproval, type ApprovalOutcome } from './room-revisions';

/** The destination whose delivery the runtime performs itself (never an agent). */
export const INVOKING_CHAT_DESTINATION = 'invoking-chat';

/** Longest list the chat summary prints. A summary that grows without bound is a transcript. */
const MAX_LISTED = 8;

export interface RoomDeliveryDeps {
  host: OrchestratorHost;
  store: RoomStore;
}

// ── 1. The approval inbox ───────────────────────────────────

/**
 * The pending approvals of ONE Room, as the home inbox renders them. Pure, so
 * `toRoomSummary` can embed it in the watched index without a store read.
 *
 * It lives here rather than in `room-state.ts` because this file owns what an
 * inbox entry says; the summary just carries it.
 */
export function toRoomAttention(record: RoomRecord): RoomAttention | undefined {
  const pending = record.approvals.filter((approval) => approval.status === 'pending');
  if (pending.length === 0) return undefined;
  return { approvals: pending.map((approval) => toApprovalEntry(record, approval)) };
}

function toApprovalEntry(record: RoomRecord, approval: RoomApprovalRequest): RoomAttentionApproval {
  const member = record.members.find((candidate) => candidate.id === approval.requestedByMemberId);
  return {
    approvalId: approval.id,
    memberId: approval.requestedByMemberId,
    // A retired member's record can be pruned before the user answers; the id
    // is still true, so the entry names it rather than pretending it is gone.
    memberName: member?.displayName ?? approval.requestedByMemberId,
    title: approval.title,
    reason: approval.reason,
    consequence: approval.consequence,
    affects: approval.affects,
    kind: approval.kind,
    estimatedCostUsd: approval.estimatedCostUsd,
    // The bound payload, so the user answers on the text itself rather than on
    // a member's description of it.
    ...(approval.delivery ? { payload: approval.delivery.content } : {}),
    createdAt: approval.createdAt,
  };
}

/**
 * Who is answering an approval. The user is the only accepted answer, and this
 * is a discriminated union rather than a boolean so a caller cannot pass the
 * wrong `true` from the wrong variable.
 */
export type ApprovalResponder = { kind: 'user' } | { kind: 'member'; memberId: string };

export type ApprovalResolution = ApprovalOutcome;

/**
 * Resolves a pending Room approval. The ONLY door to `resolveRoomApproval`:
 * a member's request is refused here, whatever the Room prose says, because an
 * approval a member can answer is not an approval (§22, FR-015).
 *
 * A member cannot reach this through the AD-020 bridge either — there is no
 * Room command for it — so this is the second layer, not the only one.
 *
 * `ok: false` with a reason is also how an approved change that no longer holds
 * comes back — the user said yes, and the Room has to say what stopped it.
 */
export async function resolveApprovalForUser(
  deps: RoomDeliveryDeps,
  roomId: string,
  approvalId: string,
  decision: 'approved' | 'rejected',
  responder: ApprovalResponder,
): Promise<ApprovalResolution> {
  if (responder.kind !== 'user') {
    return {
      ok: false,
      reason: `${responder.memberId} cannot approve this. Only you can, and the request stays open until you answer it.`,
    };
  }
  // The real mutation hook: approving a revision applies it, so a stub here
  // would be the hollow success this path exists to avoid.
  const deciding = { host: deps.host, store: deps.store, mutate: applyRevisionToRoom };
  return resolveRoomApproval(deciding, roomId, approvalId, decision);
}

/** What the Conductor has to show the user before anything leaves Sero. */
export interface DeliveryApprovalRequest {
  roomId: string;
  requestedByMemberId: string;
  reason: string;
  /** The exact payload the send will carry. The user approves THIS, and only this. */
  content: string;
  commandId: string;
}

/**
 * Raises the approval an external delivery needs, so it appears in the same
 * inbox as every other Room approval. The consequence line comes from the
 * shared access mapping, so what the user reads here and what the Room's access
 * tiles said at Start cannot disagree.
 *
 * The payload is frozen into the approval as a binding: the user is answering a
 * question about one text going to one destination, and `receiptProblems`
 * refuses any send that does not match it.
 */
export async function requestDeliveryApproval(
  deps: RoomDeliveryDeps,
  request: DeliveryApprovalRequest,
): Promise<{ ok: boolean; approval?: RoomApprovalRequest; error?: string }> {
  const { roomId, requestedByMemberId, reason, commandId } = request;
  const content = request.content.trim();
  if (!content) return { ok: false, error: 'Show the exact text you want to send — an approval with nothing in it authorises nothing.' };
  const record = await deps.store.readRoom(roomId);
  if (!record) return { ok: false, error: `Room not found: ${roomId}` };
  const destination = record.delivery.destination;
  if (!isDeliveryDestinationId(destination) || !isExternalDestination(destination)) {
    return { ok: false, error: `Delivery to ${destination} stays inside Sero, so it needs no approval.` };
  }
  if (record.approvals.some((entry) => entry.status === 'pending' && entry.kind === 'external-write')) {
    return { ok: false, error: 'This Room has already asked to send its result.' };
  }

  const now = deps.host.now();
  const label = deliveryDestinationInfo(destination).label;
  const approval: RoomApprovalRequest = {
    id: deps.host.newId('appr'),
    roomId,
    requestedByMemberId,
    title: `Send the Room's result to ${label}`,
    reason,
    consequence: `This lets the Room ${ROOM_ACCESS_LABEL_TEXT['send-outside-sero']}.`,
    affects: label,
    estimatedCostUsd: null,
    kind: 'external-write',
    permissionsAfter: null,
    status: 'pending',
    delivery: buildDeliveryBinding(destination, record.delivery.params, content),
    consumedAt: null,
    createdAt: now,
    resolvedAt: null,
  };

  const wrote = await deps.store.applyCommand(roomId, commandId, (current) => ({
    ...current,
    approvals: [...current.approvals, approval],
  }));
  if (!wrote) return { ok: false, error: 'That request was already recorded.' };

  await deps.store.appendTimeline(roomId, [{
    id: deps.host.newId('tl'),
    roomId,
    at: now,
    kind: 'approval',
    memberId: requestedByMemberId,
    summary: approval.title,
    details: { kind: approval.kind },
  }]);
  return { ok: true, approval };
}

// ── 2. Delivery ─────────────────────────────────────────────

export interface RoomDeliveryRequest {
  roomId: string;
  /** The Conductor's final answer, in its own words. */
  finalResult: string;
  /** Proof of an agent-performed send. Required for every destination the runtime does not deliver itself. */
  receipt?: DeliveryReceipt;
}

export interface RoomDeliveryOutcome {
  ok: boolean;
  /** Why the declared destination was refused. Empty when it was accepted. */
  problems: string[];
  /** True when the invoking chat received the Room's result. */
  returnedToChat: boolean;
  /** What was recorded on the Room: the receipt ref, or the session the result went back to. */
  ref: string | null;
}

/**
 * Delivers a finished Room's result (§23).
 *
 * Two independent things happen, in this order:
 *
 *  - the declared destination is CHECKED. `invoking-chat` is the runtime's own
 *    work; every other destination was delivered by an agent and is accepted
 *    only against a structurally valid receipt — with an approved token when it
 *    left Sero.
 *  - the invoking chat is ANSWERED whenever the Room recorded one, whatever the
 *    destination is. A Room started from a chat owes that chat its result even
 *    when the work product itself went to a pull request.
 *
 * A refused destination still returns to the chat, because the chat return is
 * internal and the user is exactly who needs to hear that the send did not
 * happen.
 */
export async function deliverRoomResult(
  deps: RoomDeliveryDeps,
  request: RoomDeliveryRequest,
): Promise<RoomDeliveryOutcome> {
  const record = await deps.store.readRoom(request.roomId);
  if (!record) return { ok: false, problems: [`Room not found: ${request.roomId}`], returnedToChat: false, ref: null };
  // One Room, one delivery. The approval is spent below as well, so a send is
  // single-use by its own record and not only by this guard.
  if (record.delivery.deliveredAt) {
    return { ok: true, problems: [], returnedToChat: false, ref: record.delivery.deliveryRef };
  }

  // The result IS the payload: what the destination receives and what the
  // approval was bound to are the same text, so a swapped payload is a
  // different final answer and fails the binding.
  const problems = receiptProblems(record, request.receipt, request.finalResult);
  const sessionId = record.delivery.originSessionId;
  const returnedToChat = sessionId
    ? await returnToInvokingChat(deps, record, sessionId, request.finalResult, problems)
    : false;

  // What the Room records as its delivery: the agent's proof when the declared
  // destination was accepted, else the chat that did receive the result.
  const accepted = problems.length === 0 && request.receipt ? request.receipt.ref : null;
  const ref = accepted ?? (returnedToChat && sessionId ? `session:${sessionId}` : null);
  // Nothing to record: either the destination was refused, or the Room keeps its
  // result (workspace files, no invoking chat), which is a valid outcome.
  if (ref === null) return { ok: problems.length === 0, problems, returnedToChat, ref: null };

  const now = deps.host.now();
  // The approval is spent in the SAME write that records the delivery: two
  // writes would leave a window where an accepted send has an approval that
  // still authorises another one.
  await deps.store.updateRoom(request.roomId, (current) => ({
    ...current,
    approvals: accepted ? withApprovalConsumed(current.approvals, request.receipt?.approvalId, now) : current.approvals,
    delivery: { ...current.delivery, deliveredAt: now, deliveryRef: ref },
  }));
  await deps.store.appendTimeline(request.roomId, [{
    id: deps.host.newId('tl'),
    roomId: request.roomId,
    at: now,
    kind: 'delivery',
    memberId: null,
    summary: `Result delivered to ${record.delivery.destination}.`,
    details: { ref },
  }]);
  return { ok: problems.length === 0, problems, returnedToChat, ref };
}

/**
 * Why the declared destination cannot be accepted (empty when it can).
 *
 * `invoking-chat` proves nothing here on purpose: the runtime performs that
 * send itself a few lines below, so a receipt would be the runtime attesting to
 * its own work. Every other destination follows the Workflow rule — no receipt,
 * no accepted delivery — and an EXTERNAL one additionally needs the user's
 * approval token, bound to `deliveredContent`, which no member can grant itself
 * (§22).
 */
export function receiptProblems(
  record: RoomRecord,
  receipt: DeliveryReceipt | undefined,
  deliveredContent: string,
): string[] {
  const destination = record.delivery.destination;
  if (destination === INVOKING_CHAT_DESTINATION) {
    return record.delivery.originSessionId
      ? []
      : ['this Room delivers to the chat that started it, but it was not started from a chat'];
  }
  // Results that stay in the working tree have nothing to prove — the same
  // exemption Workflow makes, for the same reason.
  if (destination === 'workspace-files') return [];
  if (!isDeliveryDestinationId(destination)) return [`"${destination}" is not a delivery destination this build knows.`];
  if (!receipt) return ['the Room finished without proof that its result was delivered'];

  const problems: string[] = [];
  if (receipt.destination !== destination) {
    problems.push(`the receipt says "${receipt.destination}" but this Room delivers to "${destination}"`);
  }
  if (!receipt.ref.trim()) problems.push('the receipt "ref" is empty — it must point at what actually landed');
  if (!receipt.summary.trim()) problems.push('the receipt "summary" is empty');
  if (Number.isNaN(Date.parse(receipt.deliveredAt))) {
    problems.push(`the receipt "deliveredAt" ("${receipt.deliveredAt}") is not a valid timestamp`);
  }
  if (isExternalDestination(destination)) {
    problems.push(...externalTokenProblems(record, receipt, deliveredContent));
  }
  return problems;
}

/**
 * Returns the Room's result to the chat that started it.
 *
 * Delivered as context, not as a steer: it lands in the user's own session and
 * is visible there, but it starts no turn and spends nothing. The user asked
 * for a Room, not for their chat to start working again on its own.
 */
async function returnToInvokingChat(
  deps: RoomDeliveryDeps,
  record: RoomRecord,
  sessionId: string,
  finalResult: string,
  problems: string[],
): Promise<boolean> {
  const content = formatRoomResult(record, finalResult, problems);
  return deps.host.session
    .sendContextMessage(
      sessionId,
      { customType: 'orchestrator-room-result', content, display: true },
      { deliverAs: 'nextTurn', triggerTurn: false, source: 'orchestrator' },
    )
    .then(() => true)
    .catch((error: unknown) => {
      // A closed session must not fail the Room: the work is done and the
      // result is on the Room record either way.
      deps.host.log(`room ${record.definition.id}: the invoking chat could not be reached: ${String(error)}`);
      return false;
    });
}

/**
 * What the invoking chat receives (§23): the final result, the completion
 * state, key artifacts, unresolved items, the Room to open, and what it cost.
 *
 * Everything except the final result is read from the Room's own computed
 * records, so a member cannot dress up how the Room finished.
 */
export function formatRoomResult(record: RoomRecord, finalResult: string, problems: string[] = []): string {
  const { definition, runtime, brief } = record;
  // Work still open, questions nobody answered and members that ended blocked —
  // all computed by the coordinator, so "unresolved" is not the Conductor's
  // opinion of how tidy the Room was.
  const unresolved = [...brief.activeWork, ...brief.openQuestions, ...brief.blockers];
  const artifacts = record.artifacts.slice(-MAX_LISTED);
  const lines = [
    `Room "${definition.title}" ${completionState(record)}.`,
    '',
    finalResult.trim() || 'The Room finished without a written result.',
  ];
  if (artifacts.length > 0) {
    lines.push('', 'Artifacts:', ...artifacts.map((artifact) => `- ${artifact.title} (${artifact.kind}): ${artifact.ref}`));
  }
  if (unresolved.length > 0) {
    lines.push('', 'Still unresolved:', ...unresolved.slice(0, MAX_LISTED).map((item) => `- ${item}`));
  }
  if (problems.length > 0) {
    lines.push('', 'Delivery not completed:', ...problems.map((problem) => `- ${problem}`));
  }
  lines.push(
    '',
    `Took ${formatDuration(durationMs(record))} · ${runtime.usage.turns} turns · ${formatCost(runtime.usage.costUsd)}`,
    // No deep link: Sero has no URL scheme for a Room, so the id is what the
    // user (or the chat's agent) opens the Room with.
    `Room: ${definition.title} (${definition.id})`,
  );
  return lines.join('\n');
}

function completionState(record: RoomRecord): string {
  const { status, stopReason } = record.runtime;
  if (status === 'completed') return 'finished';
  return stopReason ? `stopped — ${stopReason.detail}` : `stopped (${status})`;
}

function durationMs(record: RoomRecord): number | null {
  const { startedAt, endedAt } = record.runtime;
  if (!startedAt) return null;
  return Date.parse(endedAt ?? startedAt) - Date.parse(startedAt);
}

/** Compact duration for the chat summary (the renderer's formatter is renderer-scoped). */
function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'no recorded time';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const remainder = minutes % 60;
  return remainder ? `${Math.floor(minutes / 60)}h ${remainder}m` : `${Math.floor(minutes / 60)}h`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 0.1 ? 4 : 2)}`;
}
