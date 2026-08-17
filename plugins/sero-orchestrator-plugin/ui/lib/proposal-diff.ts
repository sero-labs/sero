/**
 * The Adjust recompute diff (prototype screen 5, ux-refit-plan.md phase 8).
 *
 * Component code snapshots the proposal before dispatching the adjustment and
 * computes everything shown here as a set difference over role names and
 * access entries — no planner prose is trusted for any of it.
 */

import type { RoomProposalSummary } from '../../shared/room-blueprint-types';
import { ROOM_ACCESS_LABEL_TEXT } from '../../shared/room-access-map';
import { accessTile } from './access-tile';
import { formatCost } from './format';

export interface TileDiff {
  value: string;
  /** The struck-through pre-adjust value; absent when unchanged. */
  was?: string;
}

export interface ProposalDiff {
  team: TileDiff;
  time: TileDiff;
  spend: TileDiff;
  access: TileDiff;
  /** What stayed as it was, as readable phrases. Empty when everything moved. */
  kept: string[];
  /** Role names and access phrases the revision removed. */
  removed: string[];
  /** Role names and access phrases the revision added. */
  added: string[];
}

/** `2 hours`, `45 minutes` — limits written out in full on the consent tiles. */
export function workingTimeLabel(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} minutes`;
  if (mins % 60 === 0) return `${mins / 60} hour${mins === 60 ? '' : 's'}`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function tile(value: string, previous: string): TileDiff {
  return value === previous ? { value } : { value, was: previous };
}

export function proposalDiff(prev: RoomProposalSummary, next: RoomProposalSummary): ProposalDiff {
  const prevRoles = new Set(prev.roles.map((role) => role.displayName));
  const nextRoles = new Set(next.roles.map((role) => role.displayName));
  const prevAccess = new Set(prev.access.map((entry) => entry.label));
  const nextAccess = new Set(next.access.map((entry) => entry.label));

  const rolesRemoved = prev.roles.filter((role) => !nextRoles.has(role.displayName)).map((role) => role.displayName);
  const rolesAdded = next.roles.filter((role) => !prevRoles.has(role.displayName)).map((role) => role.displayName);
  const removed = [
    ...rolesRemoved,
    ...prev.access.filter((entry) => !nextAccess.has(entry.label)).map((entry) => ROOM_ACCESS_LABEL_TEXT[entry.label]),
  ];
  const added = [
    ...rolesAdded,
    ...next.access.filter((entry) => !prevAccess.has(entry.label)).map((entry) => ROOM_ACCESS_LABEL_TEXT[entry.label]),
  ];

  const sameRoles = rolesRemoved.length === 0 && rolesAdded.length === 0
    && prev.roles.length === next.roles.length;
  const sameAccess = prevAccess.size === nextAccess.size
    && [...prevAccess].every((label) => nextAccess.has(label));

  const kept: string[] = [];
  if (next.maxWallClockMs === prev.maxWallClockMs) kept.push(`the ${workingTimeLabel(next.maxWallClockMs)} limit`);
  if (next.maxCostUsd === prev.maxCostUsd) kept.push(`the ${formatCost(next.maxCostUsd)} spend limit`);
  if (sameAccess) kept.push('the access you approved');
  if (sameRoles) kept.push('the team');

  return {
    team: tile(`${next.teamSize} members`, `${prev.teamSize} members`),
    time: tile(`Up to ${workingTimeLabel(next.maxWallClockMs)}`, `Up to ${workingTimeLabel(prev.maxWallClockMs)}`),
    spend: tile(`Up to ${formatCost(next.maxCostUsd)}`, `Up to ${formatCost(prev.maxCostUsd)}`),
    access: tile(accessPhrase(next), accessPhrase(prev)),
    kept,
    removed,
    added,
  };
}

/** The access tile phrase both sides of the diff are compared through. */
function accessPhrase(summary: RoomProposalSummary): string {
  return accessTile(summary.access).value;
}
