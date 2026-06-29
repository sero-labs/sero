/**
 * Resolves a linked loop's library status once (the header badge and the body
 * controls share it, so the linked version file is watched a single time).
 * Update-available and divergence are derived purely in the renderer (push, no
 * polling): "available" from the watched index, "modified locally" by comparing
 * the loop's plan to its linked version's plan (ignoring local model/tool picks).
 * See specs/08-loop-library.md + specs/09-ui-redesign.md.
 */

import type { LibraryIndex, LibraryVersion, Loop } from '../../shared/types';
import { plansStructurallyDiffer } from '../../shared/library';
import { useWatchedJson } from './use-watched-json';

export interface LibraryLinkStatus {
  entryId: string;
  version: number;
  entryName: string;
  latest?: number;
  updateAvailable: boolean;
  diverged: boolean;
  sourceRemoved: boolean;
  /** Newest-first version numbers (1..latest). */
  versions: number[];
  /** True when the body Library section has something to show (otherwise hide it). */
  hasActions: boolean;
}

export function useLibraryLink(loop: Loop, libraryDir: string | null, libraryIndex: LibraryIndex): LibraryLinkStatus | null {
  const link = loop.libraryLink;
  // Hook runs unconditionally; the path is null (no watch) when not linked.
  const versionPath = link && libraryDir ? `${libraryDir}/entries/${link.entryId}/versions/${link.version}.json` : null;
  const linkedVersion = useWatchedJson<LibraryVersion | null>(versionPath, null);
  if (!link) return null;

  const entry = libraryIndex.entries.find((e) => e.id === link.entryId);
  const latest = entry?.latestVersion;
  const updateAvailable = latest !== undefined && latest > link.version;
  const sourceRemoved = !!libraryDir && !entry;
  const diverged = !!linkedVersion && plansStructurallyDiffer(loop.plan, linkedVersion.definition.plan);
  const versions = latest ? Array.from({ length: latest }, (_, i) => latest - i) : [];

  return {
    entryId: link.entryId,
    version: link.version,
    entryName: entry?.name ?? 'Saved loop',
    latest,
    updateAvailable,
    diverged,
    sourceRemoved,
    versions,
    hasActions: updateAvailable || diverged || sourceRemoved || versions.length > 1,
  };
}
