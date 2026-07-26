/**
 * During a merge the working tree is grouped by what you must do about each
 * file — Conflicts, Resolved, Merged cleanly — so the list itself is the to-do
 * list (design rule 15, §7).
 *
 * "Resolved" only exists because the state carries the paths that conflicted
 * when the merge began: git drops a path from its unmerged list as soon as it
 * is staged, so without that memory a resolved file is indistinguishable from
 * one that merged cleanly.
 */

import type { FileChange } from '../../shared/types';

export interface MergeGroups {
  conflicts: FileChange[];
  /** Resolved by the AI resolver — kept apart so its work stays identifiable (§7). */
  resolvedByAi: FileChange[];
  resolved: FileChange[];
  cleanly: FileChange[];
}

export function groupForMerge(
  fileChanges: FileChange[],
  conflictPaths: string[],
  aiResolvedPaths: string[] = [],
): MergeGroups {
  const conflicted = new Set(conflictPaths);
  const byAi = new Set(aiResolvedPaths);
  const groups: MergeGroups = { conflicts: [], resolvedByAi: [], resolved: [], cleanly: [] };

  for (const file of oneRowPerPath(fileChanges)) {
    if (file.status === 'conflict') groups.conflicts.push(file);
    else if (byAi.has(file.path)) groups.resolvedByAi.push(file);
    else if (conflicted.has(file.path)) groups.resolved.push(file);
    else groups.cleanly.push(file);
  }

  return groups;
}

/**
 * A file mid-merge is listed once per staged and unstaged side. The list shows
 * one row per path, and an unresolved conflict wins over anything else said
 * about the same file.
 */
function oneRowPerPath(fileChanges: FileChange[]): FileChange[] {
  const byPath = new Map<string, FileChange>();

  for (const file of fileChanges) {
    const existing = byPath.get(file.path);
    if (existing?.status === 'conflict') continue;
    if (existing && !file.staged && file.status !== 'conflict') continue;
    byPath.set(file.path, file);
  }

  return Array.from(byPath.values());
}
