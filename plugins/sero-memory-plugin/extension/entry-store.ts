/**
 * Entry storage (design D1). The folder an entry lives in sets its delivery
 * mode, so pinning or unpinning moves the file, and a removal moves it to
 * `trash/` where a restore can find it again.
 *
 *   <global-root>/memory/entries/{pinned,on-match,unsorted}/<id>.md
 *   <global-root>/memory/trash/<id>.md
 *   <workspace>/.sero/apps/memory/entries/{pinned,on-match}/<id>.md
 *   <workspace>/.sero/apps/memory/trash/<id>.md
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  parseEntry,
  parseTrashedEntry,
  serializeEntry,
  todayStamp,
  type Delivery,
  type MemoryEntry,
  type Scope,
  type TrashedEntry,
} from './entry-format';
import { resolveMemoryRoot } from './memory-manager';

export interface StoredEntry extends MemoryEntry {
  delivery: Delivery;
  path: string;
}

/** Where the memory of one scope lives. `workspaceRoot` is the chat's `ctx.cwd`. */
export interface ScopeLocation {
  scope: Scope;
  /** Folder that holds `entries/` and `trash/`. */
  root: string;
}

export function globalLocation(): ScopeLocation {
  return { scope: 'global', root: path.join(resolveMemoryRoot(), 'memory') };
}

export function workspaceMemoryDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.sero', 'apps', 'memory');
}

export function workspaceLocation(workspaceRoot: string): ScopeLocation {
  return { scope: 'workspace', root: workspaceMemoryDir(workspaceRoot) };
}

/** Both locations a chat session in `workspaceRoot` can see, global first. */
export function visibleLocations(workspaceRoot: string): ScopeLocation[] {
  return [globalLocation(), workspaceLocation(workspaceRoot)];
}

export function entriesDir(location: ScopeLocation, delivery: Delivery): string {
  return path.join(location.root, 'entries', delivery);
}

export function trashDir(location: ScopeLocation): string {
  return path.join(location.root, 'trash');
}

/** Writes through a temporary file so a reader never sees half an entry. */
export async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

async function readEntryFile(filePath: string, delivery: Delivery): Promise<StoredEntry | null> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
  const entry = parseEntry(content);
  return entry ? { ...entry, delivery, path: filePath } : null;
}

async function listMarkdown(dir: string): Promise<string[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  return names.filter((name) => name.endsWith('.md')).sort();
}

export async function listEntries(location: ScopeLocation, delivery: Delivery): Promise<StoredEntry[]> {
  const dir = entriesDir(location, delivery);
  const entries = await Promise.all(
    (await listMarkdown(dir)).map((name) => readEntryFile(path.join(dir, name), delivery)),
  );
  return entries.filter((entry): entry is StoredEntry => entry !== null);
}

export async function listAllEntries(location: ScopeLocation): Promise<StoredEntry[]> {
  const groups = await Promise.all(
    (['pinned', 'on-match', 'unsorted'] as const).map((delivery) => listEntries(location, delivery)),
  );
  return groups.flat();
}

export async function findEntry(locations: ScopeLocation[], id: string): Promise<StoredEntry | null> {
  for (const location of locations) {
    for (const delivery of ['pinned', 'on-match', 'unsorted'] as const) {
      const entry = await readEntryFile(path.join(entriesDir(location, delivery), `${id}.md`), delivery);
      if (entry) return entry;
    }
  }
  return null;
}

export async function writeEntry(location: ScopeLocation, entry: MemoryEntry, delivery: Delivery): Promise<StoredEntry> {
  const filePath = path.join(entriesDir(location, delivery), `${entry.id}.md`);
  await writeFileAtomic(filePath, serializeEntry({ ...entry, scope: location.scope }));
  return { ...entry, scope: location.scope, delivery, path: filePath };
}

/** Moves an entry to another delivery folder. The content is unchanged. */
export async function moveEntry(location: ScopeLocation, entry: StoredEntry, delivery: Delivery): Promise<StoredEntry> {
  if (entry.delivery === delivery) return entry;
  const target = path.join(entriesDir(location, delivery), `${entry.id}.md`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(entry.path, target);
  return { ...entry, delivery, path: target };
}

/** Moves an entry to `trash/`, recording where it came from and why. */
export async function trashEntry(location: ScopeLocation, entry: StoredEntry, evidence: string): Promise<string> {
  const target = path.join(trashDir(location), `${entry.id}.md`);
  const content = serializeEntry(entry, { delivery: entry.delivery, removed: todayStamp(), evidence });
  await writeFileAtomic(target, content);
  await fs.rm(entry.path, { force: true });
  return target;
}

export async function readTrashedEntry(location: ScopeLocation, id: string): Promise<(TrashedEntry & { path: string }) | null> {
  const filePath = path.join(trashDir(location), `${id}.md`);
  try {
    const entry = parseTrashedEntry(await fs.readFile(filePath, 'utf8'));
    return entry ? { ...entry, path: filePath } : null;
  } catch {
    return null;
  }
}

/** Puts a trashed entry back in the folder it was removed from. */
export async function restoreEntry(location: ScopeLocation, id: string): Promise<StoredEntry | null> {
  const trashed = await readTrashedEntry(location, id);
  if (!trashed) return null;
  const { delivery, removed: _removed, evidence: _evidence, path: trashPath, ...entry } = trashed;
  const restored = await writeEntry(location, entry, delivery);
  await fs.rm(trashPath, { force: true });
  return restored;
}
