/**
 * How many conflicts a file still has, read from the markers themselves.
 *
 * The library exports the marker pattern it parses with, so this asks the same
 * question the resolver does rather than a second, subtly different one. It is
 * the test for "is this file resolved?", which is what decides whether the file
 * gets staged.
 */

import { MERGE_CONFLICT_START_MARKER_REGEX } from '@pierre/diffs';

export function countConflicts(contents: string): number {
  // The exported pattern is line-anchored and unflagged; matching every line
  // needs a global, multiline copy of it.
  const pattern = new RegExp(MERGE_CONFLICT_START_MARKER_REGEX.source, 'gm');
  return contents.match(pattern)?.length ?? 0;
}
