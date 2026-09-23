/**
 * The workspace id rule, shared so the host and a plugin that must predict a
 * workspace's destination use one spelling.
 *
 * Workspace IDs are interpolated into dev-server ids as the first
 * colon-separated segment, so a slug must not contain a colon. `workspaceSlug`
 * enforces that by construction; the regex is the guard for any id that arrives
 * from disk, IPC or a legacy migration.
 */

const SAFE_WORKSPACE_ID = /^[a-z0-9][a-z0-9-]*$/;

/** Convert a string to a kebab-case slug. The output always satisfies `isSafeWorkspaceId`. */
export function workspaceSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}

/** Whether the value is a safe workspace ID (colon-free, lowercase kebab-case). */
export function isSafeWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_WORKSPACE_ID.test(value);
}

/** Throws when an id would be unsafe to interpolate into runtime identifiers. */
export function assertSafeWorkspaceId(value: string): void {
  if (!isSafeWorkspaceId(value)) {
    throw new Error(`Invalid workspace id: ${JSON.stringify(value)} (must match ${SAFE_WORKSPACE_ID})`);
  }
}

/** Ensure an ID is unique within a set of existing IDs. Appends -2, -3, and so on if needed. */
export function ensureUniqueId(baseId: string, existingIds: Set<string>): string {
  assertSafeWorkspaceId(baseId);
  if (!existingIds.has(baseId)) return baseId;
  let n = 2;
  while (existingIds.has(`${baseId}-${n}`)) n++;
  return `${baseId}-${n}`;
}
