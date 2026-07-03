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

/**
 * Event source namespaces (Living Loops, spec 12). A source id is
 * `<namespace>:<kind>`, e.g. "github:ci-failed". Matching is exact — the
 * namespace list only bounds what triggers can be authored against.
 */
export const EVENT_SOURCE_NAMESPACES = ['loop', 'fs', 'github', 'webhook'] as const;

/** Shape of a valid event source id: `<namespace>:<kind>`, lowercase slugs. */
export const EVENT_SOURCE_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/;

/** True when `source` is a well-formed id in a known namespace. */
export function isKnownEventSource(source: string): boolean {
  if (!EVENT_SOURCE_PATTERN.test(source)) return false;
  return (EVENT_SOURCE_NAMESPACES as readonly string[]).includes(source.split(':', 1)[0]);
}
