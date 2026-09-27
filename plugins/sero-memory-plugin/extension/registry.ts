/**
 * Process-wide memory state (design D4).
 *
 * Pi creates one extension runtime per session and can re-evaluate this
 * module, so module-level state is not shared between sessions. Everything
 * that must be shared — the QMD store and its import, the write queue, the
 * Git check results — lives on the process global under one symbol, the same
 * way the fff plugin shares its finder.
 */

import type { QMDStore } from '@tobilu/qmd';

export type GitCheckResult = 'safe' | 'tracked';

export interface QmdState {
  /** Cached `import('@tobilu/qmd')`, so a re-evaluated module never re-imports the native graph. */
  module: Promise<typeof import('@tobilu/qmd')> | null;
  store: QMDStore | null;
  /** Store open, collections present and indexed. Awaited before a turn. */
  ready: Promise<boolean> | null;
  /** The embedding model is loaded and the index is embedded. Keyword search only until then. */
  embeddingsReady: boolean;
  embedding: Promise<void> | null;
  /** Set when a write lands while an embedding pass runs, so another pass follows. */
  embedAgain: boolean;
  /** Workspace root → its collections exist and are indexed in the open store. */
  workspaces: Map<string, Promise<boolean>>;
}

export interface MemoryRegistry {
  /** Tail of the one write queue every memory change goes through. */
  writeTail: Promise<unknown>;
  /** Definitive Git check result per workspace root, for this app run (D8). */
  gitChecks: Map<string, GitCheckResult>;
  /** Chat sessions that use the shared QMD store. */
  consumers: Set<string>;
  qmd: QmdState;
}

const REGISTRY_KEY = Symbol.for('@sero-ai/plugin-memory/qmd');

type MemoryGlobal = typeof globalThis & { [REGISTRY_KEY]?: MemoryRegistry };

export function memoryRegistry(): MemoryRegistry {
  const state = globalThis as MemoryGlobal;
  return state[REGISTRY_KEY] ??= {
    writeTail: Promise.resolve(),
    gitChecks: new Map(),
    consumers: new Set(),
    qmd: {
      module: null,
      store: null,
      ready: null,
      embeddingsReady: false,
      embedding: null,
      embedAgain: false,
      workspaces: new Map(),
    },
  };
}

/** Runs `fn` after every earlier queued write has finished, in this process. */
export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const registry = memoryRegistry();
  const run = registry.writeTail.catch(() => undefined).then(fn);
  registry.writeTail = run.catch(() => undefined);
  return run;
}
