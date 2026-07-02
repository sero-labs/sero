/**
 * Pure display helpers for delivery: the meta-strip destination chip and the
 * run-history receipt link (the trigger-summary.ts pattern — testable without
 * rendering).
 */

import type { DeliveryReceipt, Loop } from '../../shared/types';
import { deliveryDestinationInfo, effectiveDelivery } from '../../shared/delivery-types';

export interface DeliveryChip {
  label: string;
  /** Hover detail: params and whether the destination is derived from placement. */
  title: string;
}

/** The loop's destination chip. Derived (user never chose) shows as "auto". */
export function deliveryChip(loop: Loop): DeliveryChip {
  const delivery = effectiveDelivery(loop);
  const info = deliveryDestinationInfo(delivery.destination);
  const auto = loop.delivery === undefined;
  const params = Object.entries(delivery.params ?? {}).map(([k, v]) => `${k}: ${v}`);
  const title = [
    auto ? `Delivers to ${info.label} (automatic — follows the workspace placement)` : `Delivers to ${info.label}`,
    ...params,
  ].join('\n');
  return { label: auto ? `${info.label} (auto)` : info.label, title };
}

export interface ReceiptDisplay {
  label: string;
  /** Set when the ref is a URL — rendered as an external link. */
  href?: string;
  /** Hover detail: what was delivered and the exact ref. */
  title: string;
}

/** How a run's delivery receipt renders in run history. */
export function receiptDisplay(receipt: DeliveryReceipt): ReceiptDisplay {
  const info = deliveryDestinationInfo(receipt.destination);
  const ref = receipt.ref.trim();
  const url = /^https?:\/\/\S+$/.exec(ref)?.[0];
  return {
    label: info.label,
    href: url,
    title: `${receipt.summary} — ${receipt.ref}`,
  };
}
