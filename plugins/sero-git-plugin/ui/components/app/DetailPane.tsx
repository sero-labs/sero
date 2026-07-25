/**
 * What the right-hand pane shows — the one place that decides.
 *
 * The pane is never a fourth surface: it is the PR composer, or the AI
 * resolver's account, or a conflicted file, or a diff, or the prompt to pick
 * something. Keeping the whole choice here means the order of precedence is
 * readable in one place instead of inferred from nesting inside `GitApp`.
 */

import type { GitAppState } from '../../../shared/types';
import { ConflictPane } from '../diff/ConflictPane';
import { DiffPane, type DiffSelection } from '../diff/DiffPane';
import { ResolveRunPane } from '../conflict/ResolveRunPane';
import { PublishPane } from './PublishPane';
import { PullRequestPane } from './PullRequestPane';
import { DiffPaneHeader } from './GitAppChrome';
import { toWorkspacePath } from '../../lib/repo-paths';
import type { ConflictQuestionOption } from '../../store/sero-bridge';
import type { RunEntry, RunStatus } from '../../store/conflict-run';
import type { GitHubAuth } from '../../store/useGitHubAuth';

interface Props {
  state: GitAppState;
  workspaceId: string;
  workspacePath: string;
  editorThemeId: string;
  themeMode: 'light' | 'dark';
  github: GitHubAuth;

  composingPr: boolean;
  onClosePullRequest: () => void;
  onPublished: () => void;

  /** The selected working-tree file, when git still calls it conflicted. */
  conflictPath: string | null;
  onConflictResolved: (path: string) => void;

  diffSelection: DiffSelection | null;
  onCloseDiff: () => void;

  showRunLog: boolean;
  runStatus: RunStatus;
  runEntries: RunEntry[];
  onAnswer: (entryId: string, option: ConflictQuestionOption) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSelectRunFile: (path: string) => void;
}

export function DetailPane({
  state, workspaceId, workspacePath, editorThemeId, themeMode, github,
  composingPr, onClosePullRequest, onPublished,
  conflictPath, onConflictResolved,
  diffSelection, onCloseDiff,
  showRunLog, runStatus, runEntries, onAnswer, onPause, onResume, onStop, onSelectRunFile,
}: Props) {
  if (composingPr) {
    // An empty repository has nowhere to open a pull request against, so the
    // same slot offers the step that comes first (§7).
    return state.remotes.length === 0 ? (
      <PublishPane
        workspaceId={workspaceId}
        repoName={state.repoName}
        authenticated={github.authenticated}
        onClose={onClosePullRequest}
        onPublished={onPublished}
      />
    ) : (
      <PullRequestPane
        workspaceId={workspaceId}
        hasRemote={state.remotes.length > 0}
        currentBranch={state.currentBranch}
        authenticated={github.authenticated}
        onClose={onClosePullRequest}
      />
    );
  }

  // The account of what the resolver did, until you pick a file out of it —
  // then the file takes the pane, and closing it brings the account back.
  if (showRunLog) {
    return (
      <ResolveRunPane
        status={runStatus}
        entries={runEntries}
        onAnswer={onAnswer}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
        onSelectFile={onSelectRunFile}
      />
    );
  }

  // A conflicted file is not a diff of two revisions; it is one file with
  // markers in it (§9.3).
  if (conflictPath) {
    return (
      <ConflictPane
        workspaceId={workspaceId}
        path={conflictPath}
        diskPath={toWorkspacePath(workspacePath, state.repoPath, conflictPath)}
        editorThemeId={editorThemeId}
        themeType={themeMode}
        onResolved={onConflictResolved}
        onClose={runStatus === 'idle' ? undefined : onCloseDiff}
      />
    );
  }

  if (diffSelection) {
    return (
      <>
        <DiffPaneHeader selection={diffSelection} onClose={onCloseDiff} />
        <div className="min-h-0 flex-1">
          <DiffPane
            workspaceId={workspaceId}
            repoPath={state.repoPath}
            selection={diffSelection}
            diffStyle="unified"
          />
        </div>
      </>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="max-w-xs text-xs text-[var(--text-muted)]">
        Pick a file or a commit to see what changed.
      </p>
    </div>
  );
}
