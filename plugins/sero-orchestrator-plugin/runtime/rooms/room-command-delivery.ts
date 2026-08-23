/**
 * The Conductor's delivery and integration commands (spec §18, §20, §23).
 *
 * Split from `room-command-router.ts` so that file stays inside the 500-line
 * limit and reads as pure routing. Nothing here implements delivery either: the
 * approval is `room-delivery.ts`, the send proof is the delivery contract, and
 * commit collection is `room-workspace.ts`. This shapes flat command arguments
 * into those calls and answers in plain English.
 *
 * The delivery flow a Conductor actually runs is three steps, and each one is a
 * command it can reach:
 *
 *   1. `request-delivery-approval` with the exact text — the user answers.
 *   2. it sends that text with its own tools.
 *   3. `finish-room` with the same text and the receipt naming the approval.
 *
 * Step 3 is where the approval is checked and spent. A Room whose destination
 * stays inside Sero skips step 1 entirely, and a Room delivering to its
 * invoking chat needs no receipt at all — the runtime performs that send.
 */

import {
  deliveryDestinationInfo,
  isDeliveryDestinationId,
  isExternalDestination,
  type DeliveryReceipt,
} from '../../shared/delivery-types';
import type { RoomApprovalRequest } from '../../shared/room-message-types';
import type { OrchestratorHost } from '../host';
import type { RoomCommandInput, RoomCommandOutcome } from './room-command-router';
import { renderCollection } from './room-command-text';
import { INVOKING_CHAT_DESTINATION, type DeliveryApprovalRequest } from './room-delivery';
import type { RoomActionResult } from './room-lifecycle';
import type { RoomRecord } from './room-state';
import type { RoomWorkspaces } from './room-workspace';

/** The delivery half of what the router routes to. Each call already exists. */
export interface RoomDeliveryCommandDeps {
  host: OrchestratorHost;
  /** Placement and commit collection for the Room's checkouts. */
  workspaces: RoomWorkspaces;
  /** `requestDeliveryApproval` with its deps bound. Raises the user's approval. */
  requestDeliveryApproval(
    request: DeliveryApprovalRequest,
  ): Promise<{ ok: boolean; approval?: RoomApprovalRequest; error?: string }>;
  /** The coordinator's own operation. `receipt` proves an agent-performed send. */
  completeRoom(roomId: string, summary: string, receipt?: DeliveryReceipt): Promise<RoomActionResult>;
}

const ok = (text: string, details: Record<string, unknown> = {}): RoomCommandOutcome => ({ ok: true, text, details });
const no = (text: string, details: Record<string, unknown> = {}): RoomCommandOutcome => ({ ok: false, text, details });

/**
 * Asks the user to approve one text going to one destination.
 *
 * `content` is the whole point: the approval is bound to it, so the Conductor
 * has to decide what it is sending BEFORE it is allowed to send anything, and
 * the user reads that text rather than a promise about it.
 */
export async function requestDeliverySend(
  deps: RoomDeliveryCommandDeps,
  roomId: string,
  memberId: string,
  input: RoomCommandInput,
  commandId: string,
): Promise<RoomCommandOutcome> {
  const content = input.content?.trim() ?? '';
  if (!content) {
    return no('Give the exact text you want to send, in "content". The user approves that text, and only that text can be delivered.');
  }
  const result = await deps.requestDeliveryApproval({
    roomId,
    requestedByMemberId: memberId,
    reason: input.reason?.trim() || input.body?.trim() || 'The Room owes its result to this destination.',
    content,
    commandId,
  });
  if (!result.ok || !result.approval) return no(result.error ?? 'That approval could not be raised.');
  return ok(
    `The user was asked. Nothing goes out until they answer. When they have, send exactly that text and finish the Room with approvalId "${result.approval.id}", the same text as your summary, and the ref of what landed.`,
    { approvalId: result.approval.id },
  );
}

/**
 * Finishes the Room, with proof when the destination needs it.
 *
 * The receipt's checkable parts come from the member — where the send landed,
 * and which approval authorised it. The rest is COMPUTED: a summary line and a
 * timestamp the member wrote itself would prove nothing, and inventing failure
 * modes out of formatting a timestamp helps nobody.
 */
export async function finishRoomWithDelivery(
  deps: RoomDeliveryCommandDeps,
  record: RoomRecord,
  input: RoomCommandInput,
  summary: string,
): Promise<RoomCommandOutcome> {
  const roomId = record.definition.id;
  const result = await deps.completeRoom(roomId, summary, deliveryReceiptFor(deps.host, record, input));
  return result.ok
    ? ok('The Room is finished and its result was delivered.')
    : no(result.error ?? 'The Room could not be finished.');
}

/**
 * The receipt this Room's destination needs, or undefined when it needs none.
 *
 * A missing `ref` deliberately produces NO receipt rather than an empty one:
 * `deliverRoomResult` then reports "finished without proof", which is the true
 * problem, instead of a receipt-shaped object that fails on a blank field.
 */
function deliveryReceiptFor(
  host: OrchestratorHost,
  record: RoomRecord,
  input: RoomCommandInput,
): DeliveryReceipt | undefined {
  const destination = record.delivery.destination;
  if (destination === INVOKING_CHAT_DESTINATION || destination === 'workspace-files') return undefined;
  if (!isDeliveryDestinationId(destination)) return undefined;
  const ref = input.ref?.trim();
  if (!ref) return undefined;
  const receipt: DeliveryReceipt = {
    destination,
    ref,
    summary: `The Room's result was delivered to ${deliveryDestinationInfo(destination).label}.`,
    deliveredAt: host.now(),
  };
  if (isExternalDestination(destination)) receipt.approvalId = input.approvalId?.trim();
  return receipt;
}

/**
 * Collects every editing member's branch and reports the files two of them both
 * touched. Conductor-only, and `collectCommits` checks that itself against the
 * roster — the command table and the module agree rather than one trusting the
 * other.
 */
export async function collectRoomCommits(
  deps: RoomDeliveryCommandDeps,
  roomId: string,
  memberId: string,
): Promise<RoomCommandOutcome> {
  const result = await deps.workspaces.collectCommits(roomId, memberId);
  if (!result.ok) return no(result.message, { code: result.code });
  return ok(renderCollection(result), {
    branches: result.branches.length,
    conflicts: result.conflicts.length,
  });
}
