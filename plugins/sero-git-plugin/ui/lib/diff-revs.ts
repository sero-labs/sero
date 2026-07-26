/**
 * Which two revisions a selected file should be compared across.
 *
 * Kept apart from the pane that renders it because getting this wrong shows a
 * plausible but wrong diff — a staged file compared against the working tree
 * silently includes changes the user has not staged.
 */

import { WORKING_TREE_REV, type FileChangeStatus } from '@sero-ai/common';
import { INDEX_REV } from './sero-vcs';

/** A file the user picked, and the state they picked it in. */
export type DiffSelection =
  | {
      /** A row in the Git app's staging area — one side of the index. */
      kind: 'working';
      path: string;
      oldPath?: string;
      status: FileChangeStatus;
      /** Staged rows compare HEAD with the index; unstaged compare index with disk. */
      staged: boolean;
    }
  | {
      /**
       * A row in the Explorer's Changes list, which shows one row per path
       * regardless of staging — so it compares HEAD with what is on disk.
       */
      kind: 'workingCopy';
      path: string;
      oldPath?: string;
      status: FileChangeStatus;
    }
  | {
      kind: 'commitFile';
      hash: string;
      path: string;
      oldPath?: string;
      status: FileChangeStatus;
    }
  | {
      /** A whole commit — every file it touched. */
      kind: 'commit';
      hash: string;
    };

export interface RevPair {
  fromRev: string;
  toRev: string;
}

export function revsFor(selection: DiffSelection): RevPair {
  switch (selection.kind) {
    case 'commit':
    case 'commitFile':
      return { fromRev: `${selection.hash}^`, toRev: selection.hash };
    case 'workingCopy':
      return { fromRev: 'HEAD', toRev: WORKING_TREE_REV };
    case 'working':
      return selection.staged
        ? { fromRev: 'HEAD', toRev: INDEX_REV }
        : { fromRev: INDEX_REV, toRev: WORKING_TREE_REV };
  }
}

/** True when the `from` side does not exist and should not be read. */
export function isAddedOnFromSide(status: FileChangeStatus): boolean {
  return status === 'added' || status === 'untracked';
}
