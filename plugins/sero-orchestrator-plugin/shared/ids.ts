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
