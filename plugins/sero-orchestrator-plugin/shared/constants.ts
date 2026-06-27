/**
 * Shared orchestrator constants (no dependencies — safe for runtime and UI).
 */

/**
 * The lean coding tool surface every background-agent step ALWAYS gets — it is a
 * guaranteed floor that can't be removed. A step's `execution.tools` holds only
 * the EXTRA tools the planner/user layer on top (web_search, git_manager, …).
 */
export const LEAN_TOOL_BASELINE = ['bash', 'read', 'write', 'edit', 'sero-cli'];

/** True when `name` is part of the always-on lean baseline. */
export function isBaselineTool(name: string): boolean {
  return LEAN_TOOL_BASELINE.includes(name);
}
