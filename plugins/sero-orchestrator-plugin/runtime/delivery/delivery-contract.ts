/**
 * Delivery-receipt contract (spec 13). This file holds layer 1 of the
 * defence-in-depth chain — the final-step task-prompt text demanding proof of
 * delivery. Phase 3 adds the enforcement layers here (in-session repair check
 * and the engine backstop), mirroring route-contract.ts.
 */

import type { LoopDeliverySettings } from '../../shared/delivery-types';
import { deliverySpec } from './registry';

/**
 * The final-step receipt contract: how the step must prove delivery inside its
 * completion signal. Empty for workspace-files — results staying in the tree
 * need no receipt.
 */
export function formatDeliveryContract(delivery: LoopDeliverySettings): string {
  if (delivery.destination === 'workspace-files') return '';
  const spec = deliverySpec(delivery.destination);
  return `\nThis loop's declared delivery destination is "${spec.id}" (${spec.label}). Completion requires PROOF OF DELIVERY: when you emit the completion signal, the "completion" object MUST also carry a "receipt":
"completion": { "status": "complete", "reason": ..., "receipt": { "destination": "${spec.id}", "ref": "<${spec.receiptHint}>", "summary": "one sentence on what was delivered", "deliveredAt": "<ISO 8601 timestamp>" } }
The "ref" must be the REAL value from the delivery step's actual result — never invent or approximate it. If nothing was actually delivered, do not claim completion; report the true status instead.`;
}
