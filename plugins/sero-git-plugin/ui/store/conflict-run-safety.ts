/**
 * What keeps a stopped run from still changing your files.
 *
 * Two things in the run cannot be called back once they are sent: the model
 * request, and a write on its way to disk. Stop cannot reach either. So instead
 * of pretending they can be cancelled, the run gives every piece of work an
 * identity and re-checks it after each wait — and waits for outstanding writes
 * before a new run reads anything.
 *
 * It lives apart from the store because none of it is rendered, and because
 * these are the rules the run's promises rest on: they should be readable on
 * their own, not scattered through the worker that uses them.
 */

import { writeWorkingTreeFile } from '../lib/sero-vcs';

/**
 * Which run a piece of work belongs to.
 *
 * A model reply arriving after Stop has to be recognised as belonging to a run
 * that is over, and dropped — otherwise it still writes and stages the file,
 * which is precisely what Stop promised not to do.
 *
 * It also keeps runs apart. The run's state is module-scoped, so a straggler
 * from one run would otherwise land on the *next* run's bookkeeping: splicing
 * an old resolution into a file that has since been re-read, at an index that
 * no longer means what it meant. Changing the number on every start, stop and
 * reset makes that reply identifiably stale rather than plausible.
 */
let generation = 0;
let stopped = false;

/** Starts a run and returns its id. */
export function beginRun(): number {
  stopped = false;
  generation += 1;
  return generation;
}

/** Ends the current run, whether by Stop or by reset. */
export function endRun(): void {
  stopped = true;
  generation += 1;
}

export function currentRun(): number {
  return generation;
}

export function isStopped(): boolean {
  return stopped;
}

/**
 * Whether this is still the same run — stopped or not.
 *
 * Undo needs this rather than `isCurrent`: it belongs to the run that has just
 * stopped, so "is the run live?" is false exactly when undo is offered. What it
 * must not survive is a *different* run starting underneath it.
 */
export function isSameRun(runId: number): boolean {
  return runId === generation;
}

/** Whether the run that started this work is still the one in charge. */
export function isCurrent(runId: number): boolean {
  return isSameRun(runId) && !stopped;
}

/**
 * Git actions run one at a time, whatever else is going on.
 *
 * Files are resolved concurrently, so without this two `git` processes reach
 * for `.git/index.lock` at once and the second dies with "File exists". It
 * surfaced as a failed unstage during undo, which is the worst place for it:
 * the file would keep looking resolved while its markers were back on disk.
 */
let gitQueue: Promise<unknown> = Promise.resolve();

export function queueGit(run: () => Promise<void>): Promise<void> {
  const next = gitQueue.then(run, run);
  gitQueue = next.catch(() => {});
  return next;
}

/**
 * Writes still on their way to disk.
 *
 * A write, once sent, lands. That leaves an ordering hazard the run id alone
 * cannot fix: a write from the run you just stopped can settle *after* the next
 * run has read the same file, quietly undoing it. So a new run waits for these
 * first, and reads a working tree nobody else is still writing to.
 */
const pendingWrites = new Set<Promise<unknown>>();

export async function writeTracked(
  workspaceId: string,
  diskPath: string,
  contents: string,
): Promise<void> {
  const write = writeWorkingTreeFile(workspaceId, diskPath, contents);
  pendingWrites.add(write);
  try {
    await write;
  } finally {
    pendingWrites.delete(write);
  }
}

/** Looped, because settling one write can be what releases the next. */
export async function drainWrites(): Promise<void> {
  while (pendingWrites.size > 0) {
    await Promise.allSettled([...pendingWrites]);
  }
}
