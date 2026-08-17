/**
 * The Room's own surface (AD-020).
 *
 * Room commands reach a member through the single `sero-cli` tool. Without it a
 * member cannot ask, answer, report work, publish an artifact or finish the
 * Room — it can read files and talk to itself, and the Room sits there looking
 * busy until it times out. That is not a tool the planner may forget, so it is
 * not the planner's to choose: every member holds it.
 *
 * It is added to the BLUEPRINT rather than to the session, so the list the user
 * approves, the list the grant carries and the list the member runs are the
 * same list.
 */

import type { BlueprintMember, RoomBlueprint } from './room-blueprint-types';

export const ROOM_SURFACE_TOOL = 'sero-cli';

/** The member, holding the Room surface. Order is kept and nothing is duplicated. */
export function withRoomSurfaceTool(member: BlueprintMember): BlueprintMember {
  return member.tools.includes(ROOM_SURFACE_TOOL)
    ? member
    : { ...member, tools: [...member.tools, ROOM_SURFACE_TOOL] };
}

/** Every member of the blueprint, holding the Room surface. */
export function withRoomSurface(blueprint: RoomBlueprint): RoomBlueprint {
  return { ...blueprint, members: blueprint.members.map(withRoomSurfaceTool) };
}
