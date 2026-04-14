/**
 * Git command execution and output parsing.
 *
 * Focused query modules own the parsing details; this file stays as the
 * stable public barrel consumed by the extension service and tests.
 */

export {
  getCommitCount,
  getCommits,
  getCurrentBranch,
  getHeadHash,
  getRepoName,
  isGitRepo,
} from './git-log-queries';
export {
  getFileChanges,
  getRemotes,
  getStashes,
} from './git-status-queries';
export {
  getCommitDiff,
  getFileDiff,
} from './git-diff-queries';
