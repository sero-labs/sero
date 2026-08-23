/**
 * Pluggable delivery destinations (see specs/13-pluggable-delivery.md).
 *
 * A loop's destination is a user-level setting — chosen at create time,
 * editable later, never planner-chosen (like worktree placement). Delivery is
 * agent-authored: the orchestrator never sends anything itself, it only
 * enforces the structured DeliveryReceipt proof. Split from types.ts to keep
 * each file within the 500-LOC limit; re-exported from types.ts.
 */

import type { MemberPermissionLevel } from './room-blueprint-types';

export const DELIVERY_DESTINATION_IDS = [
  'pr',
  'workspace-files',
  'saved-artifact',
  'email-draft',
  'email-send',
  'chat-post',
  'webhook-post',
  'invoking-chat',
] as const;

export type DeliveryDestinationId = (typeof DELIVERY_DESTINATION_IDS)[number];

export interface LoopDeliverySettings {
  destination: DeliveryDestinationId;
  /** Destination-specific params: channel, recipients, url, report name… */
  params?: Record<string, string | number | boolean>;
}

/** Proof of delivery, emitted by the final step's agent inside its completion. */
export interface DeliveryReceipt {
  destination: DeliveryDestinationId;
  /** Where it landed: PR url, message permalink, draft id, artifact path, webhook response status + url. */
  ref: string;
  summary: string;
  deliveredAt: string;
  /**
   * The approval token this send used: the `requestId` of the gate-step
   * approval whose attached content was delivered. REQUIRED for external
   * destinations (the contract refuses the completion without it); exactly
   * that token is consumed when the receipt is accepted.
   */
  approvalId?: string;
}

/** Renderer-safe display metadata per destination (the planner/enforcement registry lives runtime-side). */
export interface DeliveryDestinationInfo {
  id: DeliveryDestinationId;
  label: string;
  /** Externally visible ⇒ the final send is approval-gated (fixed v1 rule). */
  external: boolean;
  /**
   * Params this destination understands, as UI field hints. A `required` param
   * is one the destination cannot deliver without (a webhook POST has nowhere
   * to go without its url) — enforced at activation and on delivery edits, but
   * never on shared definitions, whose values are the user's to supply.
   */
  paramHints: { key: string; placeholder: string; required?: boolean }[];
  /**
   * Rooms only. A Workflow loop has no invoking session to answer, so offering
   * this destination to a loop would buy a delivery nobody can prove happened.
   */
  roomOnly?: boolean;
}

export const DELIVERY_DESTINATIONS: DeliveryDestinationInfo[] = [
  { id: 'pr', label: 'Pull request', external: false, paramHints: [] },
  { id: 'workspace-files', label: 'Workspace files', external: false, paramHints: [] },
  { id: 'saved-artifact', label: 'Saved report', external: false, paramHints: [{ key: 'name', placeholder: 'Report name' }] },
  {
    id: 'email-draft',
    label: 'Email draft',
    external: false,
    paramHints: [
      { key: 'to', placeholder: 'Recipients' },
      { key: 'subject', placeholder: 'Subject' },
    ],
  },
  {
    id: 'email-send',
    label: 'Send email',
    external: true,
    paramHints: [
      { key: 'to', placeholder: 'Recipients' },
      { key: 'subject', placeholder: 'Subject' },
    ],
  },
  { id: 'chat-post', label: 'Chat post', external: true, paramHints: [{ key: 'channel', placeholder: '#channel' }] },
  { id: 'webhook-post', label: 'Webhook POST', external: true, paramHints: [{ key: 'url', placeholder: 'https://…', required: true }] },
  /**
   * The Room result goes back to the Sero chat that started it (spec §23).
   * `external: false` — and therefore no approval token — because the content
   * never leaves Sero: it lands in the user's own session, which is where the
   * request came from. `chat-post` is a third-party chat service and stays
   * external.
   */
  { id: 'invoking-chat', label: 'Invoking chat', external: false, roomOnly: true, paramHints: [] },
];

/**
 * Where a Room's result goes when the user does not say.
 *
 * It follows the access they chose, because that is what the result IS: a
 * read-only team produces a document, a team that edits produces changed files,
 * a team that may push produces a pull request. `invoking-chat` is never a
 * default — it only works for a Room a chat started, and a Room that cannot
 * reach its destination finishes having delivered nothing.
 */
const DEFAULT_DELIVERY: Record<MemberPermissionLevel, DeliveryDestinationId> = {
  'read-only': 'saved-artifact',
  'edit-workspace': 'workspace-files',
  'edit-and-push': 'pr',
};

export function defaultDeliveryFor(access: MemberPermissionLevel): DeliveryDestinationId {
  return DEFAULT_DELIVERY[access];
}

/** Destinations a Workflow loop may choose — everything that is not Rooms-only. */
export const LOOP_DELIVERY_DESTINATIONS: DeliveryDestinationInfo[] = DELIVERY_DESTINATIONS.filter((d) => !d.roomOnly);

export const LOOP_DELIVERY_DESTINATION_IDS: DeliveryDestinationId[] = LOOP_DELIVERY_DESTINATIONS.map((d) => d.id);

/** True when a Workflow loop may declare this destination. */
export function isLoopDeliveryDestinationId(value: unknown): value is DeliveryDestinationId {
  return isDeliveryDestinationId(value) && !deliveryDestinationInfo(value).roomOnly;
}

export function isDeliveryDestinationId(value: unknown): value is DeliveryDestinationId {
  return typeof value === 'string' && (DELIVERY_DESTINATION_IDS as readonly string[]).includes(value);
}

export function deliveryDestinationInfo(id: DeliveryDestinationId): DeliveryDestinationInfo {
  return DELIVERY_DESTINATIONS.find((d) => d.id === id)!;
}

/** Externally visible destinations require an approved human input before the send (v1). */
export function isExternalDestination(id: DeliveryDestinationId): boolean {
  return deliveryDestinationInfo(id).external;
}

/** Required param keys this delivery is missing (absent or blank). */
export function missingDeliveryParams(delivery: LoopDeliverySettings): string[] {
  return deliveryDestinationInfo(delivery.destination)
    .paramHints.filter((h) => h.required)
    .map((h) => h.key)
    .filter((key) => {
      const value = delivery.params?.[key];
      return value === undefined || String(value).trim() === '';
    });
}

/**
 * The delivery a loop actually uses: the explicit setting when the user chose
 * one, else derived from placement — worktree loops always shipped PRs and
 * workspace-root loops left files in the tree, so legacy loops (and loops the
 * user never decided for) keep that behavior, tracking later placement changes.
 */
export function effectiveDelivery(loop: {
  delivery?: LoopDeliverySettings;
  workspace: { useManagedWorktree: boolean };
}): LoopDeliverySettings {
  return loop.delivery ?? { destination: loop.workspace.useManagedWorktree ? 'pr' : 'workspace-files' };
}
