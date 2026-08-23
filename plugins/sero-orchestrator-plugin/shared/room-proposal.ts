/**
 * The computed consent summary (architecture.md §7, D-14).
 *
 * Every authority-bearing field is computed here from the validated blueprint
 * the runtime will enforce. Only four fields carry planner prose: the title,
 * the one-sentence approach, the role one-liners and the team rationale. A
 * planner sentence can never reduce or replace a computed field, which is what
 * keeps the summary the user approves and the grant the host stores in
 * agreement (NFR-015).
 *
 * Recompute this after EVERY blueprint change, including each natural-language
 * adjustment.
 */

import type { RoomBlueprint, RoomProposalSummary } from './room-blueprint-types';
import { computeAccessSummary } from './room-access-map';

export function computeProposalSummary(blueprint: RoomBlueprint): RoomProposalSummary {
  const access = computeAccessSummary(blueprint);
  return {
    teamSize: blueprint.members.length,
    conductorCount: blueprint.members.filter((member) => member.isConductor).length,
    maxWallClockMs: blueprint.envelope.maxWallClockMs,
    maxCostUsd: blueprint.envelope.maxCostUsd,
    access: access.entries,
    warnings: access.entries.flatMap((entry) => (entry.warning ? [entry.warning] : [])),
    title: blueprint.title,
    approach: blueprint.approach,
    roles: blueprint.members.map((member) => ({
      key: member.key,
      displayName: member.displayName,
      responsibility: member.responsibility,
      isConductor: member.isConductor,
      // Planner prose for "Why this team?" — carries no authority (6a).
      ...(member.reasonForInclusion ? { rationale: member.reasonForInclusion } : {}),
    })),
    teamRationale: blueprint.teamRationale,
  };
}
