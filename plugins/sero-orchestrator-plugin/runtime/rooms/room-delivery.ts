import {
  deliveryDestinationInfo,
  isDeliveryDestinationId,
  isExternalDestination,
  type DeliveryReceipt,
} from '../../shared/delivery-types';
import type {
  RoomAttention,
  RoomAttentionApproval,
  RoomAttentionPause,
  RoomAttentionRequest,
} from '../../shared/attention-types';
import { ROOM_ACCESS_LABEL_TEXT } from '../../shared/room-access-map';
import type { RoomApprovalRequest } from '../../shared/room-message-types';
import type { RoomMember } from '../../shared/room-types';
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

/**
 * The destination that IS the workspace, and what a delivery to it is called.
 *
 * Nothing is sent and nothing has to be proved: the result is the changed files,
 * which are already where the user asked for them. Without a ref of its own such
 * a Room finishes reporting that it delivered nothing, which is the opposite of
 * what happened.
 */
export const WORKSPACE_DESTINATION = 'workspace-files';
export const WORKSPACE_DELIVERY_REF = 'workspace';

/** Longest list the chat summary prints. A summary that grows without bound is a transcript. */
const MAX_LISTED = 8;

export interface RoomDeliveryDeps {
  host: OrchestratorHost;
  store: RoomStore;
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
  const deciding = {
    host: deps.host,
    store: deps.store,
    mutate: applyRevisionToRoom,
    releaseMemberSession: async () => undefined,
  };
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
/**
 * What the serialized claim decided. `won` is the only state that performs a
 * send, so exactly one caller can.
 */
type DeliveryClaim =
  | { state: 'already'; problems: string[]; ref: string | null }
  | { state: 'nothing'; problems: string[]; ref: null }
  | {
      state: 'won';
      problems: string[];
      ref: string | null;
      sessionId: string | null;
      destinationClaimed: boolean;
      originClaimed: boolean;
    };

export async function deliverRoomResult(
  deps: RoomDeliveryDeps,
  request: RoomDeliveryRequest,
): Promise<RoomDeliveryOutcome> {
  const now = deps.host.now();

  // Validate and claim in one serialized decision, so one approval cannot
  // authorize two concurrent sends.
  const claim = await deps.store.transact<DeliveryClaim>(request.roomId, null, (current) => {
    const delivery = current.delivery;
    const invokingChat = delivery.destination === INVOKING_CHAT_DESTINATION;
    if (delivery.deliveredAt && !delivery.deliveryRef) {
      return {
        record: null,
        result: { state: 'already' as const, problems: [], ref: null },
      };
    }
    // The result is the payload that the approval binds.
    const destinationAlreadyDelivered = delivery.deliveredAt !== null;
    const problems = destinationAlreadyDelivered ? [] : receiptProblems(current, request.receipt, request.finalResult);
    const accepted = destinationAlreadyDelivered
      ? delivery.deliveryRef
      : problems.length > 0
        ? null
        : request.receipt?.ref
          ?? (delivery.destination === WORKSPACE_DESTINATION ? WORKSPACE_DELIVERY_REF : null);
    const sessionId = delivery.originSessionId;
    const claimDestination = !destinationAlreadyDelivered && (accepted !== null || (invokingChat && sessionId !== null));
    const claimOrigin = !invokingChat && sessionId !== null && !delivery.originReturnedAt;
    // Nothing to claim: the destination was refused with no chat to fall back
    // on, or the Room keeps its result. Writing nothing leaves the Room free to
    // finish again with a corrected receipt.
    if (!claimDestination && !claimOrigin) {
      if (destinationAlreadyDelivered) {
        return { record: null, result: { state: 'already' as const, problems: [], ref: delivery.deliveryRef } };
      }
      return { record: null, result: { state: 'nothing' as const, problems, ref: null } };
    }

    // The claim is taken BEFORE the chat send below, so only one caller can
    // perform it. The approval is spent in the same write: two writes would
    // leave a window where an accepted send still authorises another one.
    return {
      record: {
        ...current,
        approvals: claimDestination && accepted
          ? withApprovalConsumed(current.approvals, request.receipt?.approvalId, now)
          : current.approvals,
        delivery: {
          ...delivery,
          deliveredAt: claimDestination ? now : delivery.deliveredAt,
          deliveryRef: claimDestination ? accepted : delivery.deliveryRef,
          originReturnedAt: claimOrigin ? now : delivery.originReturnedAt,
          originReturnRef: claimOrigin ? null : delivery.originReturnRef,
        },
      },
      result: {
        state: 'won' as const,
        problems,
        ref: claimDestination ? accepted : delivery.deliveryRef,
        sessionId: claimDestination && invokingChat || claimOrigin ? sessionId : null,
        destinationClaimed: claimDestination,
        originClaimed: claimOrigin,
      },
    };
  });

  const outcome = claim.duplicate ? null : claim.result;
  if (!outcome) return { ok: false, problems: ['This delivery was already recorded.'], returnedToChat: false, ref: null };
  if (outcome.state === 'already') {
    // A claim with no ref is a delivery that was attempted and did not land.
    // Reporting that as delivered is the hollow success this whole path exists
    // to prevent, so it is reported for what it is.
    return outcome.ref
      ? { ok: true, problems: [], returnedToChat: false, ref: outcome.ref }
      : {
          ok: false,
          problems: ['An earlier attempt claimed this delivery and did not complete it.'],
          returnedToChat: false,
          ref: null,
        };
  }
  if (outcome.state === 'nothing') {
    return { ok: outcome.problems.length === 0, problems: outcome.problems, returnedToChat: false, ref: null };
  }

  // The chat hears about the result whether or not the declared destination was
  // accepted: a refused external send is a reason to tell the user MORE, not to
  // leave them with nothing.
  const record = await deps.store.readRoom(request.roomId);
  const sessionId = outcome.sessionId;
  const returnedToChat =
    record && sessionId
      ? await returnToInvokingChat(deps, record, sessionId, request.finalResult, outcome.problems)
      : false;

  const chatRef = returnedToChat && sessionId ? `session:${sessionId}` : null;
  const invokingChat = record?.delivery.destination === INVOKING_CHAT_DESTINATION;
  if (invokingChat && chatRef) {
    await deps.store.updateRoom(request.roomId, (current) => ({
      ...current,
      delivery: { ...current.delivery, deliveryRef: chatRef },
    }));
  } else if (outcome.originClaimed && chatRef) {
    await deps.store.updateRoom(request.roomId, (current) => ({
      ...current,
      delivery: { ...current.delivery, originReturnRef: chatRef },
    }));
  } else if (!chatRef && (invokingChat || outcome.originClaimed)) {
    // Release only the send that failed. An accepted declared destination stays
    // delivered, while a refused destination stays retryable.
    await deps.store.updateRoom(request.roomId, (current) => ({
      ...current,
      delivery: invokingChat
        ? { ...current.delivery, deliveredAt: null }
        : { ...current.delivery, originReturnedAt: null },
    }));
  }
  const ref = outcome.ref ?? chatRef;
  const timelineRef = outcome.destinationClaimed && outcome.ref ? outcome.ref : chatRef;
  const timelineDestination = outcome.destinationClaimed && outcome.ref
    ? record?.delivery.destination ?? request.roomId
    : chatRef
      ? INVOKING_CHAT_DESTINATION
      : record?.delivery.destination ?? request.roomId;
  await deps.store.appendTimeline(request.roomId, [{
    id: deps.host.newId('tl'),
    roomId: request.roomId,
    at: now,
    kind: 'delivery',
    memberId: null,
    // A claimed delivery whose send then failed leaves no ref. Recording that
    // as "delivered" would put a false line in the audit timeline.
    summary: timelineRef
      ? `Result delivered to ${timelineDestination}.`
      : `Result could not be delivered to ${timelineDestination}.`,
    details: timelineRef ? { ref: timelineRef } : {},
  }]);
  return { ok: outcome.problems.length === 0, problems: outcome.problems, returnedToChat, ref };
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
  if (destination === WORKSPACE_DESTINATION) return [];
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
  // Delivery runs while the Room is still `completing` — that is what keeps the
  // crash marker up until the result is out — and to the reader it has finished.
  if (status === 'completed' || status === 'completing') return 'finished';
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
