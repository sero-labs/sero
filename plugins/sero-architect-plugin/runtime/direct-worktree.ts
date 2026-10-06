/**
 * The checkout the owner's own work uses in a Worktree project.
 *
 * Managed worktrees live inside the project folder, so the owner's file tools
 * already reach them. This module only makes, finds, saves and releases the
 * checkout. It never moves the owner's session.
 *
 * The checkout is keyed by the milestone, so every execution of one milestone,
 * and every restart, finds the same directory and branch. Releasing follows the
 * Room rule: commit what is there first, never force, and never delete a branch
 * Git does not call merged.
 */

import path from 'node:path';

import { directWorktree, type DirectExecution } from '../shared/direct-execution';
import type { Milestone, ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';

type Placement = DirectExecution['placement'];

export type OpenedWorktree = { ok: true; placement: Placement; note: string } | { ok: false; reason: string };
export type WorktreeStep = { ok: true } | { ok: false; reason: string };

export interface DirectWorktrees {
  /** The milestone's checkout, made now or found. Nothing is saved here. */
  open(record: ProjectRecord, milestone: Milestone): Promise<OpenedWorktree>;
  /** The saved placement's checkout, recreated from its branch when it was released. */
  ensure(record: ProjectRecord, milestone: Milestone, placement: Placement): Promise<OpenedWorktree>;
  /** Commits the checkout's uncommitted work onto its branch. */
  checkpoint(placement: Placement, message: string): Promise<WorktreeStep>;
  /** Commits interrupted work, so a stop loses nothing. Failures are logged. */
  preserveInterrupted(record: ProjectRecord): Promise<void>;
  /** Releases the checkouts of accepted and delivered, or parked, milestones. */
  releaseSettled(record: ProjectRecord): Promise<void>;
}

export const directWorktreeKey = (milestoneId: string): string => `direct-${milestoneId}`;

/** Where the host puts the checkout for a key. Used to adopt one a crash left behind. */
const checkoutPath = (folder: string, key: string): string => path.join(folder, '.sero', 'worktrees', `card-${key}`);

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The newest worktree placement this milestone ever had, superseded or not. */
function earlierPlacement(milestone: Milestone): Placement | null {
  const kept = directWorktree(milestone);
  if (kept) return kept;
  const history = [...(milestone.directHistory ?? []), ...(milestone.direct ? [milestone.direct] : [])];
  return history.findLast((execution) => execution.placement.mode === 'worktree')?.placement ?? null;
}

export type WorktreeHost = Pick<ArchitectHost, 'git' | 'pathExists' | 'exec' | 'log'>;

export function createDirectWorktrees(host: WorktreeHost): DirectWorktrees {
  const checkpoint = async (placement: Placement, message: string): Promise<WorktreeStep> => {
    try {
      await host.git.createCheckpoint(placement.directory, message);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: reasonOf(error) };
    }
  };

  const ensure: DirectWorktrees['ensure'] = async (record, milestone, placement) => {
    if (await host.pathExists(placement.directory)) return { ok: true, placement, note: '' };
    if (!placement.branch) return { ok: false, reason: `The checkout ${placement.directory} is gone and its branch was not recorded, so it cannot be restored.` };
    try {
      const made = await host.git.createWorktree(record.folder, directWorktreeKey(milestone.id), milestone.title, { existingBranch: placement.branch });
      return { ok: true, placement: { ...placement, directory: made.worktreePath, branch: made.branchName }, note: `The checkout had been released; it is restored from branch ${made.branchName}.` };
    } catch (error) {
      return { ok: false, reason: `The checkout ${placement.directory} is gone and branch ${placement.branch} could not be checked out again: ${reasonOf(error)}` };
    }
  };

  const open: DirectWorktrees['open'] = async (record, milestone) => {
    const earlier = earlierPlacement(milestone);
    if (earlier) {
      const found = await ensure(record, milestone, earlier);
      return found.ok ? { ...found, note: found.note || `The milestone's checkout ${found.placement.directory} (branch ${found.placement.branch ?? 'unknown'}) is reused.` } : found;
    }
    const key = directWorktreeKey(milestone.id);
    const existing = checkoutPath(record.folder, key);
    if (await host.pathExists(existing)) {
      // A checkout made before a restart could save it. Adopt it, never remake it.
      const head = await host.exec('git', ['rev-parse', '--abbrev-ref', 'HEAD'], existing);
      const branch = head.exitCode === 0 ? head.stdout.trim() : '';
      return { ok: true, placement: { mode: 'worktree', directory: existing, workspaceId: record.workspaceId, ...(branch ? { branch } : {}) }, note: `The milestone's checkout ${existing} already existed and is reused.` };
    }
    try {
      const made = await host.git.createWorktree(record.folder, key, milestone.title);
      return { ok: true, placement: { mode: 'worktree', directory: made.worktreePath, workspaceId: record.workspaceId, branch: made.branchName }, note: `A new checkout was made on branch ${made.branchName}, from the project's default branch. Earlier delegated work on this milestone is not carried into it.` };
    } catch (error) {
      return { ok: false, reason: `The checkout for this milestone could not be made: ${reasonOf(error)}` };
    }
  };

  return {
    open,
    ensure,
    checkpoint,
    async preserveInterrupted(record) {
      for (const milestone of record.milestones) {
        const placement = milestone.direct?.state === 'interrupted' ? directWorktree(milestone) : null;
        if (!placement || !(await host.pathExists(placement.directory))) continue;
        const saved = await checkpoint(placement, `Architect: keep interrupted work on ${milestone.title}`);
        if (!saved.ok) host.log(`could not keep the interrupted work of ${milestone.id} in ${placement.directory}: ${saved.reason}`);
      }
    },
    async releaseSettled(record) {
      for (const milestone of record.milestones) {
        const placement = directWorktree(milestone);
        const settled = (milestone.status === 'done' && milestone.receipt !== null) || milestone.status === 'parked';
        if (!placement || !settled || !(await host.pathExists(placement.directory))) continue;
        // Removal is gated on the commit: if the work cannot be kept, the checkout stays.
        const saved = await checkpoint(placement, `Architect: keep the work on ${milestone.title} before its checkout is released`);
        if (!saved.ok) {
          host.log(`kept the checkout of ${milestone.id}: ${saved.reason}`);
          continue;
        }
        try {
          await host.git.removeWorktree(record.folder, directWorktreeKey(milestone.id), { deleteMergedBranch: true });
        } catch (error) {
          host.log(`kept the checkout of ${milestone.id}: ${reasonOf(error)}`);
        }
      }
    },
  };
}

/** Where a milestone's checked work is: its worktree for direct worktree work, else the project folder. */
export async function workDirectory(host: WorktreeHost, record: ProjectRecord, milestone: Milestone): Promise<string> {
  const placement = directWorktree(milestone);
  if (!placement) return record.folder;
  const found = await createDirectWorktrees(host).ensure(record, milestone, placement);
  if (!found.ok) throw new Error(found.reason);
  return found.placement.directory;
}
