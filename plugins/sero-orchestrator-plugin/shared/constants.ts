/**
 * Shared orchestrator constants (no dependencies — safe for runtime and UI).
 */

/**
 * Default lean tool surface for a background-agent step that names no tools.
 * The planner adds extras (web_search, git_manager, …) per step as needed; this
 * is the floor every coding step gets.
 */
export const LEAN_TOOL_BASELINE = ['bash', 'read', 'write', 'edit', 'sero-cli'];
