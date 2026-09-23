/**
 * The workspace id rule, shared so the host and a plugin that must predict a
 * workspace's destination use one spelling.
 *
 * Workspace ids are interpolated into dev-server ids as the first
 * colon-separated segment, so a slug must not contain a colon. This function
 * enforces that by construction.
 */

/** Convert a string to a kebab-case slug. The output never contains a colon. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}
