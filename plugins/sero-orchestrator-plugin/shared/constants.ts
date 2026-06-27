/**
 * Shared orchestrator constants (no dependencies — safe for runtime and UI).
 */

/**
 * The default tools every background-agent step ALWAYS gets — a guaranteed floor
 * that can't be removed. A step's `execution.tools` holds only the EXTRA tools
 * the planner/user layer on top (web_search, git_manager, …).
 */
export const DEFAULT_TOOLS = ['bash', 'read', 'write', 'edit', 'sero-cli'];

/** True when `name` is one of the always-on default tools. */
export function isDefaultTool(name: string): boolean {
  return DEFAULT_TOOLS.includes(name);
}
