/**
 * The AI conflict-resolution run (§7).
 *
 * **Automatic, not a proposal queue.** One button; it resolves what it can and
 * applies as it goes, and interrupts only when it genuinely cannot decide.
 *
 * Three rules shape the whole thing:
 *
 * - **A question blocks that conflict, not the run.** Files run concurrently,
 *   so a question in `parse.ts` leaves `format.ts` running. Within a file the
 *   conflicts are serial, and that is not a limitation: the answer to conflict
 *   3 is exactly what conflict 4 needs, which is the forward carry the design
 *   is built around.
 * - **Stop keeps completed resolutions.** They are ordinary working-tree
 *   changes and perfectly good on their own.
 * - **Undo reverts only the machine's work.** Every resolution is recorded
 *   against the file's original contents with who decided it, so undo is a
 *   rebuild with the AI's entries left out — not a reverse patch.
 *
 * The store is module-scoped on purpose: a contributed view unmounts when it is
 * hidden (AD-025), and a run must survive someone looking at another app.
 */

import { create } from 'zustand';
import { countConflicts } from '../lib/conflict-markers';
import { parseConflictRegions, rebuildWithResolutions } from '../lib/conflict-regions';
import { readWorkingTreeFile } from '../lib/sero-vcs';
import {
  beginRun,
  currentRun,
  drainWrites,
  endRun,
  isCurrent,
  isSameRun,
  isStopped,
  queueGit,
  writeTracked,
} from './conflict-run-safety';
import type {
  ConflictAnswer,
  ConflictQuestionOption,
  ConflictResolveInput,
} from './sero-bridge';
import { seroBridge } from './sero-bridge';

/** How many files are worked on at once. Enough to feel parallel, not a stampede. */
const FILE_CONCURRENCY = 3;
/** Lines of the file shown to the model either side of the block. */
const CONTEXT_LINES = 40;

export type RunStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'finished';

export type EntryState = 'queued' | 'working' | 'done' | 'asked' | 'declined' | 'failed';

export interface RunEntry {
  id: string;
  path: string;
  /** Which conflict in the file, counting from 1 — what the line says. */
  conflictNumber: number;
  state: EntryState;
  /** What it did and why, in one line, for whoever reviews this later. */
  why?: string;
  /** Who decided: the model, or you answering its question. */
  source?: 'ai' | 'answer';
  question?: { question: string; because: string; options: ConflictQuestionOption[] };
}

interface FileRun {
  /** Contents before the run touched it. Every rebuild starts here. */
  original: string;
  diskPath: string;
  resolutions: Map<number, { content: string; source: 'ai' | 'answer' }>;
}

/** What the run needs from the app to reach git and the disk. */
export interface RunContext {
  workspaceId: string;
  /** Repo-relative path → workspace-relative, or null when it is outside. */
  toDiskPath: (repoRelativePath: string) => string | null;
  /** Staging is git's own definition of resolved. */
  onStage: (path: string) => Promise<void>;
  /**
   * Put the file back to genuinely conflicted — index stages and all — rather
   * than merely unstaging it. Unstaging leaves something git reads as your own
   * edit, which `merge --abort` then keeps, stranding markers after the merge.
   */
  onRestoreConflict: (path: string) => Promise<void>;
}

interface ConflictRunState {
  status: RunStatus;
  entries: RunEntry[];
  /** Files this run resolved at least one conflict in, for the sparkle marks. */
  aiResolvedPaths: string[];
  error: string | null;

  start: (context: RunContext, conflictPaths: string[]) => void;
  answer: (entryId: string, option: ConflictQuestionOption) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  undoAiResolutions: () => void;
  reset: () => void;
}

// Run-scoped, outside the store: none of it is rendered, and keeping it out
// means a re-render can never be triggered by bookkeeping.
let files = new Map<string, FileRun>();
let answers: ConflictAnswer[] = [];
let context: RunContext | null = null;
let paused = false;
let resumeWaiters: Array<() => void> = [];
/** Woken by `stop()`, so a file waiting on a question is released rather than polled. */
let stopWaiters: Array<() => void> = [];
/** Resolved by `answer()` — this is what suspends a file at a question. */
let answerWaiters = new Map<string, (option: ConflictQuestionOption) => void>();

export const useConflictRun = create<ConflictRunState>((set, get) => ({
  status: 'idle',
  entries: [],
  aiResolvedPaths: [],
  error: null,

  start: (runContext, conflictPaths) => {
    if (get().status === 'running' || get().status === 'paused') return;

    files = new Map();
    answers = [];
    context = runContext;
    paused = false;
    resumeWaiters = [];
    stopWaiters = [];
    answerWaiters = new Map();
    const runId = beginRun();
    set({ status: 'running', entries: [], error: null });

    void runFiles(runId, conflictPaths, set, get);
  },

  answer: (entryId, option) => {
    const waiter = answerWaiters.get(entryId);
    if (!waiter) return;
    answerWaiters.delete(entryId);
    waiter(option);
  },

  pause: () => {
    if (get().status !== 'running') return;
    paused = true;
    set({ status: 'paused' });
  },

  resume: () => {
    if (get().status !== 'paused') return;
    paused = false;
    const waiters = resumeWaiters;
    resumeWaiters = [];
    set({ status: 'running' });
    for (const wake of waiters) wake();
  },

  // Everything already resolved stays: it is in the working tree, and it is
  // ordinary work whether or not the rest of the run happened.
  stop: () => {
    paused = false;
    endRun();
    for (const wake of resumeWaiters) wake();
    resumeWaiters = [];
    for (const wake of stopWaiters) wake();
    stopWaiters = [];
    set({ status: 'stopped' });
  },

  undoAiResolutions: () => {
    void undoAi(set, get);
  },

  reset: () => {
    endRun();
    for (const wake of resumeWaiters) wake();
    for (const wake of stopWaiters) wake();
    files = new Map();
    answers = [];
    context = null;
    answerWaiters = new Map();
    resumeWaiters = [];
    stopWaiters = [];
    set({ status: 'idle', entries: [], aiResolvedPaths: [], error: null });
  },
}));

type Set = (partial: Partial<ConflictRunState>) => void;
type Get = () => ConflictRunState;

async function runFiles(runId: number, conflictPaths: string[], set: Set, get: Get): Promise<void> {
  // Before anything is read: a write left over from the run you stopped must
  // land first, or this run reads a file that is about to change underneath it.
  await drainWrites();
  if (!isCurrent(runId)) return;

  const queue = [...conflictPaths];
  const workers = Array.from(
    { length: Math.min(FILE_CONCURRENCY, queue.length) },
    async () => {
      while (isCurrent(runId)) {
        const path = queue.shift();
        if (path === undefined) return;
        await runOneFile(runId, path, set, get);
      }
    },
  );

  await Promise.all(workers);
  if (isCurrent(runId)) set({ status: 'finished' });
}

async function runOneFile(runId: number, path: string, set: Set, get: Get): Promise<void> {
  const ctx = context;
  if (!ctx) return;

  const diskPath = ctx.toDiskPath(path);
  if (diskPath === null) {
    addEntry(runId, set, get, {
      id: `${path}:outside`,
      path,
      conflictNumber: 1,
      state: 'failed',
      why: 'This file is outside the workspace, so it cannot be resolved here.',
    });
    return;
  }

  let original: string;
  try {
    original = await readWorkingTreeFile(ctx.workspaceId, diskPath);
  } catch (cause) {
    addEntry(runId, set, get, {
      id: `${path}:unreadable`,
      path,
      conflictNumber: 1,
      state: 'failed',
      why: messageOf(cause, `Could not read ${path}.`),
    });
    return;
  }

  const regions = parseConflictRegions(original);
  if (regions.length === 0) return;

  // The read above was awaited, so the run may be over — and `files` is shared,
  // meaning a stale entry here would be picked up by whatever runs next.
  if (!isCurrent(runId)) return;

  const file: FileRun = { original, diskPath, resolutions: new Map() };
  files.set(path, file);

  // Every line appears at once, so the pane is the to-do list from the start.
  for (const region of regions) {
    addEntry(runId, set, get, {
      id: entryId(path, region.index),
      path,
      conflictNumber: region.index + 1,
      state: 'queued',
    });
  }

  for (const region of regions) {
    if (!isCurrent(runId)) return;
    await waitWhilePaused();
    if (!isCurrent(runId)) return;

    const id = entryId(path, region.index);
    updateEntry(runId, set, get, id, { state: 'working' });

    try {
      const outcome = await seroBridge().vcs.resolveConflictWithAi(ctx.workspaceId, {
        path,
        conflictNumber: region.index + 1,
        conflictCount: regions.length,
        current: region.current,
        incoming: region.incoming,
        ...(region.base === undefined ? {} : { base: region.base }),
        currentLabel: region.currentLabel,
        incomingLabel: region.incomingLabel,
        context: contextAround(original, region.startLine, region.endLine),
        answers: [...answers],
      } satisfies ConflictResolveInput);

      // The model was thinking while you pressed Stop. Its answer is no longer
      // wanted: dropping it here is what stops the file being written after the
      // run ended.
      if (!isCurrent(runId)) return;

      if (outcome.decision === 'resolve') {
        await applyResolution(runId, path, region.index, outcome.content, 'ai', set, get);
        updateEntry(runId, set, get, id, { state: 'done', why: outcome.why, source: 'ai' });
        continue;
      }

      if (outcome.decision === 'decline') {
        updateEntry(runId, set, get, id, { state: 'declined', why: outcome.why });
        continue;
      }

      // A question suspends this file only. Everything else carries on.
      updateEntry(runId, set, get, id, {
        state: 'asked',
        question: {
          question: outcome.question,
          because: outcome.because,
          options: outcome.options,
        },
      });

      const chosen = await waitForAnswer(id);
      if (chosen === null || !isCurrent(runId)) return; // stopped while waiting

      answers.push({ question: outcome.question, answer: chosen.label });

      if (chosen.content === undefined) {
        // "Let me edit it" — the markers stay, and the resolver pane is where
        // that happens. The run does not pretend this one is finished.
        updateEntry(runId, set, get, id, {
          state: 'declined',
          why: `left for you to edit — you chose "${chosen.label}"`,
        });
        continue;
      }

      await applyResolution(runId, path, region.index, chosen.content, 'answer', set, get);
      updateEntry(runId, set, get, id, {
        state: 'done',
        why: `you chose ${chosen.label}${chosen.detail ? ` (${chosen.detail})` : ''}`,
        source: 'answer',
      });
    } catch (cause) {
      updateEntry(runId, set, get, id, { state: 'failed', why: messageOf(cause, 'The model could not resolve this one.') });
    }
  }
}

/**
 * Writes the file as it now stands: the original with every resolution so far
 * spliced in. Rebuilding from the original rather than patching what is on disk
 * is what keeps the conflict indices meaningful and makes undo possible.
 */
async function applyResolution(
  runId: number,
  path: string,
  index: number,
  content: string,
  source: 'ai' | 'answer',
  set: Set,
  get: Get,
): Promise<void> {
  const ctx = context;
  const file = files.get(path);
  // Checked again here rather than trusted from the caller: this is the only
  // place that writes to the working tree, so it is the one that has to be
  // certain the run is still live.
  if (!ctx || !file || !isCurrent(runId)) return;

  file.resolutions.set(index, { content, source });
  const next = rebuildWithResolutions(file.original, contentsOf(file.resolutions));
  await writeTracked(ctx.workspaceId, file.diskPath, next);

  // The write is the one step that cannot be taken back. Everything after it
  // can be, so the run is checked again here: a Stop landing mid-write must not
  // then go on to mark the file AI-resolved or stage it.
  if (!isCurrent(runId)) return;

  if (source === 'ai' && !get().aiResolvedPaths.includes(path)) {
    set({ aiResolvedPaths: [...get().aiResolvedPaths, path] });
  }
  // Staged is git's own definition of resolved, so only a file with nothing
  // left in it gets staged.
  if (countConflicts(next) === 0) {
    await queueGit(async () => {
      // Checked inside the queue, not before it: this can sit behind another
      // file's git call for long enough that the run ends while it waits.
      if (!isCurrent(runId)) return;
      await ctx.onStage(path);
    });
  }
}

async function undoAi(set: Set, get: Get): Promise<void> {
  const ctx = context;
  if (!ctx) return;

  /*
   * Undo belongs to the run that has just finished or stopped, so it cannot ask
   * `isCurrent` — that is already false the moment you press Stop, which is
   * precisely when undo is offered. Identity is what matters here: undo must
   * not survive a *different* run starting underneath it, rebuilding files from
   * an original that is no longer the one on disk.
   */
  const runId = currentRun();

  for (const [path, file] of files) {
    if (!isSameRun(runId)) return;

    const kept = new Map(
      [...file.resolutions].filter(([, resolution]) => resolution.source === 'answer'),
    );
    if (kept.size === file.resolutions.size) continue;

    file.resolutions = kept;
    const reverted = rebuildWithResolutions(file.original, contentsOf(kept));
    try {
      // Order matters: git rebuilds the conflict first — which rewrites the
      // file with its own markers — and our version, carrying whatever you
      // answered, goes on top. Doing it the other way round would throw the
      // answers away.
      if (countConflicts(reverted) > 0) {
        await queueGit(async () => {
          if (!isSameRun(runId)) return;
          await ctx.onRestoreConflict(path);
        });
      }
      if (!isSameRun(runId)) return;
      await writeTracked(ctx.workspaceId, file.diskPath, reverted);
    } catch (cause) {
      set({ error: messageOf(cause, `Could not undo ${path}.`) });
      continue;
    }
  }

  if (!isSameRun(runId)) return;

  set({
    aiResolvedPaths: [],
    entries: get().entries.map((entry) => (
      entry.source === 'ai' ? { ...entry, state: 'queued' as EntryState, why: undefined, source: undefined } : entry
    )),
  });
}

function contentsOf(
  resolutions: ReadonlyMap<number, { content: string; source: 'ai' | 'answer' }>,
): Map<number, string> {
  return new Map([...resolutions].map(([index, resolution]) => [index, resolution.content]));
}

function waitWhilePaused(): Promise<void> {
  if (!paused) return Promise.resolve();
  return new Promise((resolve) => resumeWaiters.push(resolve));
}

/**
 * Suspends this file until the question is answered, or until Stop releases it.
 * Stop pushes to every waiter rather than being polled for — a file sitting on
 * a question has to be woken, or the run never settles.
 */
function waitForAnswer(id: string): Promise<ConflictQuestionOption | null> {
  if (isStopped()) return Promise.resolve(null);
  return new Promise((resolve) => {
    answerWaiters.set(id, resolve);
    stopWaiters.push(() => {
      if (!answerWaiters.delete(id)) return;
      resolve(null);
    });
  });
}

function contextAround(contents: string, startLine: number, endLine: number): string {
  const lines = contents.split(/\r?\n/);
  const from = Math.max(0, startLine - 1 - CONTEXT_LINES);
  const to = Math.min(lines.length, endLine + CONTEXT_LINES);
  return lines.slice(from, to).join('\n');
}

function entryId(path: string, index: number): string {
  return `${path}:${index}`;
}

// Both take the run id for the same reason: the entries list belongs to the
// run on screen, and a straggler from the last one must not append to it or
// rewrite a line that now means something else.
function addEntry(runId: number, set: Set, get: Get, entry: RunEntry): void {
  if (!isCurrent(runId)) return;
  set({ entries: [...get().entries, entry] });
}

function updateEntry(runId: number, set: Set, get: Get, id: string, patch: Partial<RunEntry>): void {
  if (!isCurrent(runId)) return;
  set({
    entries: get().entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  });
}

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
