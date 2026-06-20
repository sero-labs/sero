// Worktree + PR host fakes for the Phase 6 isolation/PR flow, split out of the
// harness to keep it under the 500-LOC limit. Mirrors the desktop-core card
// naming (`.sero/worktrees/card-<id>`, `feat/<slug>-<id>`) and records every
// call so tests can assert the real plugin flow drove them.

import { join } from 'node:path';

import type {
  AppRuntimeCreatePullRequestOptions,
  AppRuntimeCreatePullRequestResult,
  AppRuntimeMergePullRequestResult,
  AppRuntimePullRequestMergeState,
} from '@sero-ai/common';

/** Records the worktree/PR host calls the real Phase 6 flow makes, for assertions. */
export interface GitControl {
  creates: { cardId: string; cardTitle: string }[];
  removes: { cardId: string; options?: { deleteBranch?: boolean; force?: boolean } }[];
  pushes: { worktreePath: string; branch: string }[];
  prs: AppRuntimeCreatePullRequestOptions[];
  merges: { prNumber: number; method?: string }[];
  /** The deterministic worktree path the fake `createWorktree` returns for an id. */
  worktreePath(cardId: string): string;
  /** The deterministic branch the fake `createWorktree` returns for an id/title. */
  branchName(cardId: string, cardTitle: string): string;
}

/** The configurable results these fakes return; a subset of HarnessOptions. */
export interface WorktreePrFakes {
  pushBranch?: boolean;
  createPrResult?: AppRuntimeCreatePullRequestResult;
  mergePrResult?: AppRuntimeMergePullRequestResult;
  prMergeState?: AppRuntimePullRequestMergeState;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'work';
}

/** A deterministic worktree/PR recorder mirroring the desktop-core card naming. */
export function makeGitControl(workspaceRoot: string): GitControl {
  return {
    creates: [],
    removes: [],
    pushes: [],
    prs: [],
    merges: [],
    worktreePath: (cardId) => join(workspaceRoot, '.sero', 'worktrees', `card-${cardId}`),
    branchName: (cardId, cardTitle) => `feat/${slugify(cardTitle)}-${cardId}`,
  };
}

/** The Phase 6 `host.git` methods (worktree lifecycle + PR flow), recording into `git`. */
export function makeWorktreePrGit(fakes: WorktreePrFakes, git: GitControl) {
  return {
    async createWorktree(_workspacePath: string, cardId: string, cardTitle: string) {
      git.creates.push({ cardId, cardTitle });
      return {
        worktreePath: git.worktreePath(cardId),
        branchName: git.branchName(cardId, cardTitle),
        greenfield: false,
      };
    },
    async removeWorktree(
      _workspacePath: string,
      cardId: string,
      options?: { deleteBranch?: boolean; force?: boolean },
    ) {
      git.removes.push({ cardId, options });
    },
    async pushBranch(worktreePath: string, branch: string) {
      git.pushes.push({ worktreePath, branch });
      return fakes.pushBranch ?? true;
    },
    async createPr(_worktreePath: string, options: AppRuntimeCreatePullRequestOptions) {
      git.prs.push(options);
      return fakes.createPrResult ?? { success: true as const, url: 'https://example.test/pr/1', number: 1 };
    },
    async mergePr(_worktreePath: string, prNumber: number, options?: { method?: string }) {
      git.merges.push({ prNumber, method: options?.method });
      return fakes.mergePrResult ?? { success: true as const, state: 'merged' as const };
    },
    async getPrMergeState(_worktreePath: string, _prNumber: number) {
      return fakes.prMergeState ?? 'open';
    },
  };
}
