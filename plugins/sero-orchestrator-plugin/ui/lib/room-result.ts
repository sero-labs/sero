/**
 * What a finished Room's result view shows, derived from the record alone.
 *
 * Pure so the rules can be tested directly: which artifact is the plan, which
 * line the Room closed on, and where the result went. The drawing fixes the
 * first — the Conductor's plan, or the newest plan when the Conductor made
 * none — and the rest follow from the record rather than from a second copy.
 */

import type { RoomArtifact } from '../../shared/room-message-types';
import type { PersistedRoom, RoomMember } from '../../shared/room-types';
import { formatDayTime } from './format';

/**
 * The plan the result view shows in place: the Conductor's own plan, or the
 * newest plan when the Conductor did not write one. Null when the Room
 * published no plan at all, which is a state the view shows rather than fills.
 */
export function pickPlan(room: PersistedRoom, members: Map<string, RoomMember>): RoomArtifact | null {
  const plans = room.artifacts.filter((artifact) => artifact.kind === 'plan');
  if (plans.length === 0) return null;
  const conductorId = room.memberIds.find((id) => members.get(id)?.isConductor);
  const authored = conductorId ? plans.filter((plan) => plan.producedByMemberId === conductorId) : [];
  const pool = authored.length > 0 ? authored : plans;
  return pool.reduce((newest, plan) => (plan.createdAt > newest.createdAt ? plan : newest));
}

/** The artifacts the plan card is not already showing in place. */
export function otherArtifacts(room: PersistedRoom, plan: RoomArtifact | null): RoomArtifact[] {
  return room.artifacts.filter((artifact) => artifact.id !== plan?.id);
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The Room's own closing line, less its pointer to the plan shown below it.
 *
 * The sentence is dropped ONLY when it names the plan that is on the page. A
 * closing line that points at another artifact, or at nothing, is kept exactly
 * as the Room wrote it — the fact moves into the page, it does not disappear.
 */
export function resultLine(finalLine: string | null, plan: RoomArtifact | null): string | null {
  if (!finalLine || !plan) return finalLine;
  const without = finalLine
    .replace(new RegExp(`\\s*[^.]*Final plan:\\s*${escape(plan.id)}\\.?\\s*$`), '')
    .trim();
  return without.length > 0 ? without : finalLine;
}

/** Where the result went, in the one row that says it. */
export function deliveredLine(room: PersistedRoom): { text: string; ref: string | null } {
  const { deliveredAt, destination, deliveryRef } = room.delivery;
  // The record holds the destination's id. The drawing reads "workspace files",
  // which is that id with its hyphens opened out.
  const where = destination.replace(/-/g, ' ');
  if (!deliveredAt) {
    return { text: `Not delivered to ${where}. Nothing left Sero.`, ref: null };
  }
  return { text: `To ${where} · ${formatDayTime(deliveredAt)}`, ref: deliveryRef };
}

/** A member as every Room surface names it: the full name, never a truncation. */
export function memberLabel(member: RoomMember | undefined, memberId: string): string {
  return member?.displayName ?? memberId;
}
