/**
 * Pure id helpers shared between runtime and extension.
 */

/**
 * Stable synthetic parent session id for a loop's autonomous runs.
 * Format: `orchestrator:<workspaceId>:<loopId>` (see 02-integration-seams.md).
 */
export function loopParentSessionId(workspaceId: string, loopId: string): string {
  return `orchestrator:${workspaceId}:${loopId}`;
}

/**
 * Parent session for the Room planner's own model calls.
 *
 * Planning happens before a Room exists, so this names the workspace's planner
 * rather than a Room. A Room created FROM a chat keeps that chat's session id on
 * its delivery record instead — that is what the result goes back to.
 */
export function roomPlannerSessionId(workspaceId: string): string {
  return `orchestrator-room:${workspaceId}:planner`;
}
