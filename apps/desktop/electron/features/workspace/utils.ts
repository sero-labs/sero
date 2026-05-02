/**
 * Utility helpers for workspace name/ID operations.
 *
 * Extracted from WorkspaceManager to keep file sizes manageable.
 */

/** Convert a string to a kebab-case slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'workspace';
}

/** Ensure an ID is unique within a set of existing IDs. Appends -2, -3, etc. if needed. */
export function ensureUniqueId(baseId: string, existingIds: Set<string>): string {
  if (!existingIds.has(baseId)) return baseId;

  let n = 2;
  while (existingIds.has(`${baseId}-${n}`)) n++;
  return `${baseId}-${n}`;
}

/** Convert a slug/folder name into a display name (e.g. "my-app" → "My App"). */
export function prettifyName(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
