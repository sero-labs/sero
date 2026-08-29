/**
 * Pattern classification for `grep`.
 *
 * Adapted from `@ff-labs/pi-fff` (MIT, © Dmitry Kovalenko); see NOTICE.md.
 */

import type { GrepMode } from '@ff-labs/fff-node';

const REGEX_METACHARACTERS = /[.*+?^${}()|[\]\\]/g;

/**
 * Literal patterns are the common case and the fastest path, so regex mode is
 * chosen only when the pattern both looks like a regex and compiles as one.
 */
export function detectGrepMode(pattern: string): GrepMode {
  if (!hasRegexSyntax(pattern) || /^[.^$]+$/.test(pattern)) return 'plain';
  try {
    new RegExp(pattern);
    return 'regex';
  } catch {
    return 'plain';
  }
}

export function hasRegexSyntax(pattern: string): boolean {
  return pattern !== pattern.replace(REGEX_METACHARACTERS, '\\$&');
}

const WILDCARD_ONLY = new Set([
  '*',
  '?',
  '.',
  '.*',
  '.+',
  '.*?',
  '.*+',
  '.+?',
  '^.*$',
  '^.+$',
]);

/**
 * A pattern that matches every line is an attempt to read whole files with
 * grep. Detecting it up front turns a dozen wasted calls into one clear error.
 */
export function isWildcardOnly(pattern: string): boolean {
  const trimmed = pattern.trim();
  return WILDCARD_ONLY.has(trimmed);
}

/**
 * Whether the caller pinned one file (the last path segment has an extension).
 * A pinned file may simply be misnamed, so the zero-result fuzzy fallback is
 * allowed to broaden past the constraint; a directory constraint is not, or the
 * fallback would leak matches from excluded directories.
 */
export function pathTargetsFile(pathConstraint: string | undefined): boolean {
  const lastSegment = pathConstraint?.split(/[\\/]/).pop() ?? '';
  return /\.[a-zA-Z][a-zA-Z0-9]{0,9}$/.test(lastSegment);
}
