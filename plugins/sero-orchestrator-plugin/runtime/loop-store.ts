/**
 * File-backed loop store: keeps an in-memory OrchestratorState cache and splits
 * each loop across small files so run-time writes stay cheap and bounded:
 *   loops/<id>/loop.json          — config + current runtime + plan (no history)
 *   loops/<id>/runs/<runId>.json  — one full run per file
 *   loops/<id>/runs/index.json    — compact run summaries (watched by the UI)
 *   loops/<id>/revisions.json     — full plan-revision history
 *   index.json                    — lightweight per-loop summaries (the loop list)
 *
 * The in-memory `Loop` is reassembled on read, so coordinator/engine logic is
 * unchanged. The runtime is the single writer, so the cache is authoritative.
 * A loop's frequent step writes touch only its own loop.json + the active run
 * file, never the whole history and never another loop. A legacy single
 * state.json — and a legacy loop.json that still inlines runs/revisions — both
 * auto-migrate into the split layout.
 */

import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import { DEFAULT_STATE } from '../shared/defaults';
import type {
  Loop,
  LoopRun,
  OrchestratorIndex,
  OrchestratorState,
  PlanRevision,
  RunIndex,
} from '../shared/types';
import { buildIndex, buildRunIndex, composeState, diffRuns, diffState, stripLoopForPersist } from './store';
import { migrateLegacyPendingEvent } from './event-queue';
import { migrateLoopState } from './loop-migrations';

export interface LoopStore {
  readState(): Promise<OrchestratorState>;
  updateState(updater: (current: OrchestratorState) => OrchestratorState): Promise<void>;
}

export function createLoopStore(ctx: AppRuntimeContext): LoopStore {
  const stateDir = path.dirname(ctx.stateFilePath);
  const indexPath = path.join(stateDir, 'index.json');
  const loopDir = (id: string) => path.join(stateDir, 'loops', id);
  const loopFile = (id: string) => path.join(loopDir(id), 'loop.json');
  const runsDir = (id: string) => path.join(loopDir(id), 'runs');
  const runFile = (id: string, runId: string) => path.join(runsDir(id), `${runId}.json`);
  const runIndexFile = (id: string) => path.join(runsDir(id), 'index.json');
  const revisionsFile = (id: string) => path.join(loopDir(id), 'revisions.json');
  const legacyBackup = `${ctx.stateFilePath}.pre-split-backup`;

  let cache: OrchestratorState | null = null;
  let loadPromise: Promise<OrchestratorState> | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  const readJson = <T>(file: string) => ctx.host.appState.read<T>(file);
  // Atomic write that also triggers the file watcher the UI subscribes to.
  const writeJson = <T>(file: string, data: T) => ctx.host.appState.update<T>(file, () => data);

  /** Writes every file for a loop (initial create, migration, or full rewrite). */
  async function persistLoopFull(loop: Loop): Promise<void> {
    await writeJson(loopFile(loop.id), stripLoopForPersist(loop));
    for (const run of loop.runs) await writeJson(runFile(loop.id, run.id), run);
    await writeJson(runIndexFile(loop.id), buildRunIndex(loop.runs));
    if (loop.revisions.length) await writeJson(revisionsFile(loop.id), loop.revisions);
  }

  /** Writes only the parts of a loop that actually changed since `prev`. */
  async function persistLoopDiff(prev: Loop | undefined, next: Loop): Promise<void> {
    if (!prev) return persistLoopFull(next);
    const nextStripped = stripLoopForPersist(next);
    if (JSON.stringify(stripLoopForPersist(prev)) !== JSON.stringify(nextStripped)) {
      await writeJson(loopFile(next.id), nextStripped);
    }
    const runs = diffRuns(prev.runs, next.runs);
    for (const run of runs.changed) await writeJson(runFile(next.id, run.id), run);
    for (const runId of runs.removedIds) await rm(runFile(next.id, runId), { force: true });
    if (runs.indexChanged) await writeJson(runIndexFile(next.id), buildRunIndex(next.runs));
    if (JSON.stringify(prev.revisions) !== JSON.stringify(next.revisions)) {
      await writeJson(revisionsFile(next.id), next.revisions);
    }
  }

  async function persistAll(state: OrchestratorState): Promise<void> {
    for (const loop of state.loops) await persistLoopFull(loop);
    await writeJson(indexPath, buildIndex(state));
  }

  /** Reassembles a loop's runs/revisions from their files, migrating legacy inline data. */
  async function reassembleLoop(persisted: Loop): Promise<Loop> {
    // Pre-queue loops persisted a single `pendingEvent` stash — read it as a
    // one-element queue (spec 15).
    const loop = migrateLegacyPendingEvent(persisted);
    const runIndex = await readJson<RunIndex>(runIndexFile(loop.id));
    if (runIndex?.runs) {
      const runs: LoopRun[] = [];
      for (const summary of runIndex.runs) {
        const run = await readJson<LoopRun>(runFile(loop.id, summary.id));
        if (run) runs.push(run);
      }
      const revisions = (await readJson<PlanRevision[]>(revisionsFile(loop.id))) ?? [];
      const full = { ...loop, runs, revisions };
      const migrated = migrateLoopState(full);
      if (migrated !== full) await persistLoopFull(migrated);
      return migrated;
    }
    // Legacy loop.json that still inlines runs/revisions → migrate to split files.
    const full: Loop = { ...loop, runs: loop.runs ?? [], revisions: loop.revisions ?? [] };
    const migrated = migrateLoopState(full);
    await persistLoopFull(migrated);
    return migrated;
  }

  async function load(): Promise<OrchestratorState> {
    const index = await readJson<OrchestratorIndex>(indexPath);
    if (index?.loops) {
      const loops: Loop[] = [];
      for (const summary of index.loops) {
        const loop = await readJson<Loop>(loopFile(summary.id));
        if (loop) loops.push(await reassembleLoop(loop));
      }
      return composeState(loops);
    }
    // Migrate a legacy single state.json into the split layout (keep a backup).
    const legacy = await readJson<OrchestratorState>(ctx.stateFilePath);
    if (legacy?.loops?.length) {
      const migrated = composeState(legacy.loops.map(migrateLoopState));
      await persistAll(migrated);
      await rename(ctx.stateFilePath, legacyBackup).catch(() => undefined);
      return migrated;
    }
    return structuredClone(DEFAULT_STATE);
  }

  async function ensureLoaded(): Promise<OrchestratorState> {
    if (cache) return cache;
    loadPromise ??= load();
    cache = await loadPromise;
    return cache;
  }

  async function persistDiff(prev: OrchestratorState, next: OrchestratorState): Promise<void> {
    const { changed, removedIds, indexChanged } = diffState(prev, next);
    const prevById = new Map(prev.loops.map((l) => [l.id, l]));
    for (const loop of changed) await persistLoopDiff(prevById.get(loop.id), loop);
    for (const id of removedIds) await rm(loopDir(id), { recursive: true, force: true });
    if (indexChanged) await writeJson(indexPath, buildIndex(next));
  }

  // Serialize writes; a failure does not poison the queue for later writes.
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    readState: async () => structuredClone(await ensureLoaded()),
    updateState: (updater) =>
      serialize(async () => {
        const prev = await ensureLoaded();
        const next = updater(prev);
        await persistDiff(prev, next);
        cache = next;
      }),
  };
}
