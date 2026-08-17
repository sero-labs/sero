/**
 * What an external Room send is allowed to be (spec §22, §23, FR-026).
 *
 * Workflow already answers this for a loop: an approval token is bound to the
 * content the user read, the receipt names that token, and accepting the
 * receipt consumes it (`runtime/delivery/delivery-contract.ts`). A Room asks the
 * same question against different records, so this carries that rule across
 * rather than inventing a second approval mechanism:
 *
 *  - the approval freezes the payload AND the destination as ONE hash, so a
 *    swapped payload and a redirected send both fail the same check;
 *  - the receipt names the approval, and the delivery declares the payload it
 *    sent — an approved message cannot be traded for another one;
 *  - accepting the receipt CONSUMES the approval, so one approval is one send.
 *
 * The honest limit is the same as the loop's: no code here can know what bytes
 * actually left the machine. What is guaranteed is mechanical — nothing is ever
 * ACCEPTED as delivered without a bound, single-use, user-granted approval.
 */

import { createHash } from 'node:crypto';
import type { DeliveryDestinationId, DeliveryReceipt } from '../../shared/delivery-types';
import type { RoomApprovalRequest, RoomDeliveryBinding } from '../../shared/room-message-types';
import type { RoomDelivery } from '../../shared/room-types';
import type { RoomRecord } from './room-state';

type DeliveryTarget = Pick<RoomDelivery, 'destination' | 'params'>;

/**
 * The one value an approval is bound to. Params are sorted so two equal
 * destinations hash equally whatever order they were written in, and the
 * payload is trimmed at the edges so a trailing newline is not a different
 * message.
 */
export function deliveryBindingHash(target: DeliveryTarget, content: string): string {
  const params = Object.entries(target.params ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return createHash('sha256')
    .update(JSON.stringify([target.destination, params, content.trim()]))
    .digest('hex');
}

/**
 * The binding recorded on the approval the user is about to be shown. The
 * destination is passed narrowed rather than read off the record, so an
 * approval can only ever be bound to a destination this build knows.
 */
export function buildDeliveryBinding(
  destination: DeliveryDestinationId,
  params: RoomDelivery['params'],
  content: string,
): RoomDeliveryBinding {
  return {
    destination,
    contentHash: deliveryBindingHash({ destination, params }, content),
    content: content.trim(),
  };
}

/** Approvals that could still authorise a send: answered yes, bound, and unused. */
export function usableDeliveryApprovals(record: RoomRecord): RoomApprovalRequest[] {
  return record.approvals.filter(
    (approval) =>
      approval.kind === 'external-write' &&
      approval.status === 'approved' &&
      approval.consumedAt === null &&
      approval.delivery !== null,
  );
}

/**
 * Why this receipt may not send `deliveredContent` out of Sero (empty when it
 * may). Every refusal names what to do next, because the member's next turn is
 * the only place it can be corrected.
 */
export function externalTokenProblems(
  record: RoomRecord,
  receipt: DeliveryReceipt,
  deliveredContent: string,
): string[] {
  const destination = record.delivery.destination;
  const usable = usableDeliveryApprovals(record);
  const named = receipt.approvalId?.trim();

  // Checked before the "nothing usable" case below, because the commonest way
  // to reach that case is spending the Room's only approval. Reporting it as
  // "you have not approved that send" would send the Conductor looking for an
  // approval the user already granted; "already used" tells it to ask again.
  if (named && record.approvals.some((candidate) => candidate.id === named && candidate.consumedAt !== null)) {
    return [`approval "${named}" was already used for a send, and one approval covers one send`];
  }
  if (usable.length === 0) {
    return [`"${destination}" sends the result outside Sero, and you have not approved that send`];
  }
  if (!named) {
    return [
      `the receipt does not name the approval that authorised the send (open: ${usable.map((approval) => `"${approval.id}"`).join(', ')})`,
    ];
  }
  const approval = usable.find((candidate) => candidate.id === named);
  if (!approval) {
    return [`the receipt names approval "${named}", which this Room has no approved record of`];
  }
  // Non-null on every usable approval; the check keeps the compiler honest.
  const binding = approval.delivery;
  if (!binding) return [`approval "${named}" records nothing about what it approved, so it authorises no send`];
  if (binding.destination !== destination) {
    return [`approval "${named}" was granted for a send to "${binding.destination}", and this Room now delivers to "${destination}"`];
  }
  if (binding.contentHash !== deliveryBindingHash(record.delivery, deliveredContent)) {
    return [
      `what is being delivered is not the text approval "${named}" was granted for — send exactly the approved text, or ask again with the text you actually sent`,
    ];
  }
  return [];
}

/**
 * Marks the approval an accepted delivery used. Only the named one is consumed:
 * a Room with two approved sends must not lose the second to the first.
 */
export function withApprovalConsumed(
  approvals: RoomApprovalRequest[],
  approvalId: string | undefined,
  now: string,
): RoomApprovalRequest[] {
  if (!approvalId) return approvals;
  return approvals.map((approval) =>
    approval.id === approvalId && approval.consumedAt === null ? { ...approval, consumedAt: now } : approval,
  );
}
