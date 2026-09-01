/**
 * WorktreeManager — LEGACY key-addressed worktree lifecycle.
 *
 * Each work item got its own git worktree at `.sero/worktrees/card-<id>/`,
 * named by a logical key. A logical key is not a release fence: a delayed
 * cleanup naming the same key resets whatever that key now points at, which is
 * why new work allocates through the lease pool (`./pool`) instead.
 *
 * This manager stays for the `card-*` checkouts made before the pool existed.
 * It allocates no pool slot, and its removal path no longer deletes a
 * directory that Git refused to remove.
 */

import path from 'path';
import type { AppRuntimeWorktreeRemoveOptions } from '@sero-ai/common';

import { resolvePreferredBaseRef } from './workspace-sync';
import { execWorktreeGit } from './exec';
import {
  addWorktreeOnExistingBranch,
  addWorktreeOnNewBranch,
  buildTaskBranchName,
  ensureGitReady,
} from './provision';
import {
  deleteWorktreeBranch,
  pruneWorktreeRegistrations,
  removeRegisteredWorktree,
} from './removal';
import { listWorktreeRegistrations, registrationBranch } from './pool/registration';
import { LEGACY_DIR_PREFIX, worktreesRoot } from './pool/paths';
import { canonicalPath } from './pool/repository';

export interface WorktreeInfo {
  cardId: string;
  branchName: string;
  worktreePath: string;
}

/** Why `exists()` answered as it did. Directory presence alone proves nothing. */
export type WorktreeValidation =
  | { status: 'registered'; worktreePath: string; branchName: string | null }
  | { status: 'not-registered'; reason: string }
  | { status: 'unavailable'; reason: string };

export class WorktreeManager {
  /**
   * Generate the worktree directory path for a card.
   */
  getPath(workspacePath: string, cardId: string): string {
    return path.join(worktreesRoot(workspacePath), `${LEGACY_DIR_PREFIX}${cardId}`);
  }

  /**
   * Generate a branch name for a card based on its title.
   */
  buildBranchName(cardTitle: string, cardId: string): string {
    return buildTaskBranchName(cardTitle, cardId);
  }

  /**
   * Create a worktree for a card.
   *
   * Creates a new branch and checks it out in an isolated directory.
   * The worktree shares the `.git` object store with the main repo.
   * With `existingBranch`, checks out that branch (fetching it from origin
   * when it only exists remotely) instead of minting a new one — never
   * delete such a worktree's branch on removal, it belongs to a PR.
   *
   * @returns The absolute path to the worktree directory
   */
  async create(
    workspacePath: string,
    cardId: string,
    cardTitle: string,
    options?: { existingBranch?: string },
  ): Promise<{ worktreePath: string; branchName: string; greenfield: boolean }> {
    const worktreePath = this.getPath(workspacePath, cardId);

    if (options?.existingBranch) {
      await addWorktreeOnExistingBranch(workspacePath, worktreePath, options.existingBranch);
      console.log(`[worktree] Created worktree for card-${cardId} at ${worktreePath} (existing branch: ${options.existingBranch})`);
      return { worktreePath, branchName: options.existingBranch, greenfield: false };
    }

    // Ensure the workspace is a valid git repo with at least one commit
    const greenfield = await ensureGitReady(workspacePath);
    const branchName = this.buildBranchName(cardTitle, cardId);
    const baseRef = await resolvePreferredBaseRef(workspacePath);
    await addWorktreeOnNewBranch(workspacePath, worktreePath, branchName, baseRef);

    console.log(`[worktree] Created worktree for card-${cardId} at ${worktreePath} (branch: ${branchName})${greenfield ? ' [greenfield]' : ''}`);
    return { worktreePath, branchName, greenfield };
  }

  /**
   * Remove a worktree and optionally delete its branch.
   *
   * When Git refuses the removal, the directory, its contents and its branch
   * are left exactly as they are. A failed removal is Git reporting that it
   * cannot prove the checkout disposable, so deleting it anyway would destroy
   * the work the refusal was protecting.
   */
  async remove(
    workspacePath: string,
    cardId: string,
    opts?: AppRuntimeWorktreeRemoveOptions,
  ): Promise<void> {
    const worktreePath = this.getPath(workspacePath, cardId);

    // Read the branch before removal — afterwards the checkout is gone.
    let branchName: string | null = null;
    if (opts?.deleteBranch || opts?.deleteMergedBranch) {
      try {
        const { stdout } = await execWorktreeGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: worktreePath,
          timeout: 5_000,
        });
        branchName = stdout.trim();
      } catch {
        // Worktree may already be gone.
      }
    }

    const outcome = await removeRegisteredWorktree(workspacePath, worktreePath, { force: opts?.force });
    if (outcome.status === 'preserved') {
      console.warn(`[worktree] Kept card-${cardId}: ${outcome.detail}`);
      return;
    }
    await pruneWorktreeRegistrations(workspacePath);

    if (branchName) {
      await deleteWorktreeBranch(workspacePath, branchName, {
        deleteBranch: opts?.deleteBranch,
        deleteMergedBranch: opts?.deleteMergedBranch,
      });
    }
    console.log(`[worktree] Removed worktree for card-${cardId}`);
  }

  /**
   * List all active legacy worktrees in a workspace.
   */
  async list(workspacePath: string): Promise<WorktreeInfo[]> {
    const listing = await listWorktreeRegistrations(workspacePath);
    if (listing.status !== 'ok') return [];
    return listing.records.flatMap((record) => {
      const branchName = registrationBranch(record);
      const dirName = path.basename(record.path);
      if (!branchName || !dirName.startsWith(LEGACY_DIR_PREFIX)) return [];
      return [{
        cardId: dirName.slice(LEGACY_DIR_PREFIX.length),
        branchName,
        worktreePath: record.path,
      }];
    });
  }

  /**
   * Whether Git still registers a worktree for a card. The directory alone is
   * not the question: a directory Git does not know about cannot be worked in,
   * and a registration whose directory is gone is not a usable checkout either.
   */
  async validate(workspacePath: string, cardId: string): Promise<WorktreeValidation> {
    const worktreePath = this.getPath(workspacePath, cardId);
    const listing = await listWorktreeRegistrations(workspacePath);
    if (listing.status !== 'ok') {
      return { status: 'unavailable', reason: listing.reason };
    }
    const expectedPath = await canonicalPath(worktreePath);
    let record: (typeof listing.records)[number] | undefined;
    for (const candidate of listing.records) {
      if (await canonicalPath(candidate.path) === expectedPath) {
        record = candidate;
        break;
      }
    }
    if (!record) return { status: 'not-registered', reason: `Git has no worktree registered at ${worktreePath}.` };
    if (record.prunable) {
      return { status: 'not-registered', reason: `Git reports ${worktreePath} prunable: ${record.prunableReason ?? 'no reason given'}.` };
    }
    return { status: 'registered', worktreePath: record.path, branchName: registrationBranch(record) };
  }

  /**
   * Check if a worktree exists for a card, by Git registration rather than by
   * directory presence.
   */
  async exists(workspacePath: string, cardId: string): Promise<boolean> {
    return (await this.validate(workspacePath, cardId)).status === 'registered';
  }
}
