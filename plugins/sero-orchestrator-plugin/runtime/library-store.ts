/**
 * Profile-global Loop Library store, backed by the global app-state dir
 * (`$SERO_HOME/apps/orchestrator-library/`, resolved on the desktop side via
 * `host.appState.globalDir` — the plugin never hardcodes SERO_HOME).
 *
 * Layout (see specs/08-loop-library.md):
 *   index.json                      — watched entry list (drives the browser + badges)
 *   entries/<entryId>/entry.json    — entry metadata
 *   entries/<entryId>/versions/<n>.json — immutable versions
 *
 * Reads/writes go through `host.appState` (atomic, serialized, parent-dir
 * creating, and watchable); directory removal uses fs directly since the
 * app-state API has no recursive delete.
 */

import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import { DEFAULT_LIBRARY_INDEX } from '../shared/defaults';
import type { LibraryEntry, LibraryEntrySummary, LibraryIndex, LibraryVersion } from '../shared/types';
import type { LibraryStore } from './host';

const LIBRARY_NAMESPACE = 'orchestrator-library';

/** Versions are immutable and monotonic (1..latest, none removed), so count === latestVersion. */
function toEntrySummary(entry: LibraryEntry): LibraryEntrySummary {
  return {
    id: entry.id,
    name: entry.name,
    summary: entry.summary,
    latestVersion: entry.latestVersion,
    versionCount: entry.latestVersion,
    catalog: entry.catalog,
    updatedAt: entry.updatedAt,
  };
}

export function createLibraryStore(ctx: AppRuntimeContext): LibraryStore {
  const { appState } = ctx.host;

  let rootPromise: Promise<string> | null = null;
  const root = () => (rootPromise ??= appState.globalDir(LIBRARY_NAMESPACE).then((r) => r.path));

  const indexFile = async () => path.join(await root(), 'index.json');
  const entryDir = async (id: string) => {
    // Containment chokepoint: entryFile/versionFile/deleteEntry all resolve here,
    // so a crafted entryId (e.g. "../../x") can never read, write, or recursively
    // delete outside the library tree.
    const base = path.join(await root(), 'entries');
    const dir = path.resolve(base, id);
    const rel = path.relative(base, dir);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`unsafe library entry id: ${JSON.stringify(id)}`);
    }
    return dir;
  };
  const entryFile = async (id: string) => path.join(await entryDir(id), 'entry.json');
  const versionFile = async (id: string, v: number) => path.join(await entryDir(id), 'versions', `${v}.json`);

  const updateIndex = async (apply: (entries: LibraryEntrySummary[]) => LibraryEntrySummary[]) => {
    await appState.update<LibraryIndex>(await indexFile(), (current) => ({
      version: 1,
      entries: apply((current ?? DEFAULT_LIBRARY_INDEX).entries),
    }));
  };

  return {
    dir() {
      return root();
    },
    async readIndex() {
      return (await appState.read<LibraryIndex>(await indexFile())) ?? structuredClone(DEFAULT_LIBRARY_INDEX);
    },
    async readEntry(entryId) {
      return appState.read<LibraryEntry>(await entryFile(entryId));
    },
    async readVersion(entryId, version) {
      return appState.read<LibraryVersion>(await versionFile(entryId, version));
    },
    async putVersion(entry, version) {
      // Write the version first, then the entry, then the index, so a watcher
      // that sees the new index can always resolve the version it points at.
      await appState.update<LibraryVersion>(await versionFile(entry.id, version.version), () => version);
      await appState.update<LibraryEntry>(await entryFile(entry.id), () => entry);
      await updateIndex((entries) => [...entries.filter((e) => e.id !== entry.id), toEntrySummary(entry)]);
    },
    async deleteEntry(entryId) {
      await rm(await entryDir(entryId), { recursive: true, force: true });
      await updateIndex((entries) => entries.filter((e) => e.id !== entryId));
    },
    async watchIndex() {
      appState.watch(await indexFile());
    },
    async unwatchIndex() {
      appState.unwatch(await indexFile());
    },
  };
}
