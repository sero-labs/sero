/**
 * The shared QMD index (design D4): one store and one embedding model for the
 * whole process, whatever the number of chat sessions.
 *
 * The index gives recall its vector half (see `search-score.ts`).
 *
 * Collections, per scope:
 *   `memory-global`, `memory-ws-<hash>`          — `entries/on-match/` only; recall searches these
 *   `memory-global-all`, `memory-ws-<hash>-all`  — every entry folder; the save-time close-entry check
 * QMD stores content by hash, so an entry in both collections is embedded once.
 * `trash/`, the old daily and session files, and `MEMORY.md` are never indexed.
 *
 * The index database lives in the profile. The embedding model stays in QMD's
 * per-machine cache (`~/.cache/qmd`), never in a profile: Pi extensions cannot
 * reach `host.toolchains.sharedToolsDir`, which is the stated exception.
 */

import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { QMDStore } from '@tobilu/qmd';

import { resolveAgentDir } from './agent-dir';
import { entriesDir, globalLocation, workspaceLocation, type ScopeLocation } from './entry-store';
import { error, errorDetails } from './logger';
import { enqueueWrite, memoryRegistry } from './registry';

export type SearchMode = 'hybrid' | 'keyword';

export interface CollectionPair {
  /** On-match entries only. */
  recall: string;
  /** Every entry folder of the scope. */
  all: string;
}

const RESULTS_PER_QUERY = 20;

export function resolveIndexPath(): string {
  return path.join(resolveAgentDir(), 'cache', 'qmd', 'memory.sqlite');
}

export function collectionsFor(location: ScopeLocation): CollectionPair {
  const base = location.scope === 'global'
    ? 'memory-global'
    : `memory-ws-${createHash('sha256').update(path.resolve(location.root)).digest('hex').slice(0, 12)}`;
  return { recall: base, all: `${base}-all` };
}

function loadQmd(): Promise<typeof import('@tobilu/qmd')> {
  const qmd = memoryRegistry().qmd;
  qmd.module ??= import('@tobilu/qmd');
  return qmd.module;
}

async function ensureCollection(store: QMDStore, name: string, dir: string, pattern: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const existing = (await store.listCollections()).find((collection) => collection.name === name);
  if (existing && path.resolve(existing.pwd) === path.resolve(dir) && existing.glob_pattern === pattern) return;
  if (existing) await store.removeCollection(name);
  await store.addCollection(name, { path: dir, pattern });
}

/** Indexing goes through the write queue so it never interleaves with a memory change. */
function ensureScope(store: QMDStore, location: ScopeLocation): Promise<void> {
  return enqueueWrite(async () => {
    const names = collectionsFor(location);
    await ensureCollection(store, names.recall, entriesDir(location, 'on-match'), '*.md');
    await ensureCollection(store, names.all, path.join(location.root, 'entries'), '**/*.md');
    await store.update({ collections: [names.recall, names.all] });
  });
}

function openStore(): Promise<boolean> {
  const qmd = memoryRegistry().qmd;
  qmd.ready ??= (async () => {
    const { createStore } = await loadQmd();
    const dbPath = resolveIndexPath();
    await mkdir(path.dirname(dbPath), { recursive: true });
    const store = await createStore({ dbPath });
    qmd.store = store;
    await ensureScope(store, globalLocation());
    return true;
  })().catch(async (err) => {
    await error('qmd_open_failed', errorDetails(err));
    qmd.ready = null;
    qmd.store = null;
    return false;
  });
  return qmd.ready;
}

/**
 * Loads the embedding model and embeds new entries, in the background. Search
 * stays keyword-only until the first pass finishes.
 */
function scheduleEmbedding(): void {
  const qmd = memoryRegistry().qmd;
  if (qmd.embedding) {
    qmd.embedAgain = true;
    return;
  }
  qmd.embedding = (async () => {
    do {
      qmd.embedAgain = false;
      const store = qmd.store;
      if (!store) return;
      await store.embed();
      // A first query embedding loads the model now, not during a user's turn.
      if (!qmd.embeddingsReady) await store.searchVector('memory', { limit: 1 });
      qmd.embeddingsReady = true;
    } while (qmd.embedAgain);
  })().catch(async (err) => {
    await error('qmd_embed_failed', errorDetails(err));
  }).finally(() => {
    qmd.embedding = null;
  });
}

/**
 * Opens the shared store and indexes the global scope and `workspaceRoot`.
 * Resolves false when QMD is unavailable; memory then works without recall.
 */
export function warmUp(workspaceRoot: string): Promise<boolean> {
  const qmd = memoryRegistry().qmd;
  const root = path.resolve(workspaceRoot);
  let workspaceReady = qmd.workspaces.get(root);
  if (!workspaceReady) {
    workspaceReady = openStore().then(async (open) => {
      if (!open || !qmd.store) return false;
      await ensureScope(qmd.store, workspaceLocation(root));
      scheduleEmbedding();
      return true;
    }).catch(async (err) => {
      await error('qmd_workspace_index_failed', { workspaceRoot: root, ...errorDetails(err) });
      qmd.workspaces.delete(root);
      return false;
    });
    qmd.workspaces.set(root, workspaceReady);
  }
  return workspaceReady;
}

export function acquireIndex(sessionId: string, workspaceRoot: string): Promise<boolean> {
  memoryRegistry().consumers.add(sessionId);
  return warmUp(workspaceRoot);
}

/** Releases a session. The store closes when the last chat session leaves. */
export async function releaseIndex(sessionId: string): Promise<void> {
  const registry = memoryRegistry();
  registry.consumers.delete(sessionId);
  if (registry.consumers.size > 0) return;
  const qmd = registry.qmd;
  const store = qmd.store;
  await qmd.embedding?.catch(() => undefined);
  if (registry.consumers.size > 0) return;
  qmd.store = null;
  qmd.ready = null;
  qmd.embeddingsReady = false;
  qmd.workspaces.clear();
  await store?.close().catch(() => undefined);
}

/** Re-reads the scope's entry folders. Call inside the write queue after a change. */
export async function refreshIndex(location: ScopeLocation): Promise<void> {
  const store = memoryRegistry().qmd.store;
  if (!store) return;
  try {
    const names = collectionsFor(location);
    await store.update({ collections: [names.recall, names.all] });
    scheduleEmbedding();
  } catch (err) {
    await error('qmd_update_failed', { root: location.root, ...errorDetails(err) });
  }
}

function idOf(filePath: string): string {
  return path.basename(filePath).replace(/\.md$/i, '');
}

export interface VectorOutcome {
  /** Entry id → cosine similarity. Empty in keyword mode. */
  similarity: Map<string, number>;
  mode: SearchMode;
}

/**
 * Vector similarity of the query to the entries in `collections`. Returns
 * keyword mode, with no similarities, until the embedding model is ready.
 */
export async function vectorSearch(query: string, collections: string[]): Promise<VectorOutcome> {
  const qmd = memoryRegistry().qmd;
  const similarity = new Map<string, number>();
  const store = qmd.store;
  if (!store || !qmd.embeddingsReady || !query.trim()) return { similarity, mode: 'keyword' };
  for (const collection of collections) {
    const results = await store.searchVector(query, { collection, limit: RESULTS_PER_QUERY });
    for (const result of results) {
      const id = idOf(result.filepath);
      similarity.set(id, Math.max(similarity.get(id) ?? 0, result.score));
    }
  }
  return { similarity, mode: 'hybrid' };
}
