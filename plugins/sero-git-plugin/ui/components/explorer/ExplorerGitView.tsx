/**
 * The Explorer's Git view — reading what changed, then leaving.
 *
 * Changes and history on the left at 300px, the diff filling the rest. The two
 * lists share a fixed height: Changes takes what it needs up to half the view
 * then scrolls, History takes the remainder and scrolls too, so neither can
 * push the other out of sight (§4 of docs/features/git-ux.md).
 *
 * Deliberately thin: no commit box, no branch list, no PR form, no auth banner
 * and no sync buttons — those live in the Git app and the titlebar popover.
 * Clicking a row opens its diff here; clicking a row's file icon leaves for the
 * Editor.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, GitBranch, RefreshCw } from 'lucide-react';
import { openSeroApp, openSeroFile, useAppInfo } from '@sero-ai/app-runtime';
import type { CommitEntry, StatusFile } from '@sero-ai/common';
import { DiffPane, type DiffSelection } from '../diff/DiffPane';
import { useVcsStore, useWorkspaceVcs } from '../../store/vcs-store';
import { CommitRow, FileRow, SectionHeader } from './rows';

export function ExplorerGitView() {
  const { workspaceId, workspacePath } = useAppInfo();
  const vcs = useWorkspaceVcs(workspaceId);
  const [selection, setSelection] = useState<DiffSelection | null>(null);

  const loadWorkspace = useVcsStore((s) => s.loadWorkspace);
  const refreshAll = useVcsStore((s) => s.refreshAll);
  const initEventListener = useVcsStore((s) => s.initEventListener);
  const subscribeGitState = useVcsStore((s) => s.subscribeGitState);

  // The push subscription and the initial load — the plugin starts these now
  // that the host's explorer lifecycle no longer does (AD-025).
  useEffect(() => initEventListener(), [initEventListener]);
  useEffect(() => {
    if (!workspaceId) return;
    void loadWorkspace(workspaceId);
    if (!workspacePath) return;
    return subscribeGitState(workspaceId, workspacePath);
  }, [workspaceId, workspacePath, loadWorkspace, subscribeGitState]);

  const files = vcs?.wcStatus?.files ?? [];
  const commits = vcs?.logEntries ?? [];
  const repoPath = vcs?.repoPath || workspacePath;

  const selectFile = useCallback((file: StatusFile) => {
    setSelection({
      kind: 'workingCopy',
      path: file.path,
      oldPath: file.oldPath,
      status: file.status,
    });
  }, []);

  const selectCommit = useCallback((commit: CommitEntry) => {
    setSelection({ kind: 'commit', hash: commit.fullSha || commit.sha });
  }, []);

  const openInEditor = useCallback((file: StatusFile) => {
    void openSeroFile(workspaceId, file.path);
  }, [workspaceId]);

  const selectedPath = selection && selection.kind !== 'commit' ? selection.path : null;
  const selectedHash = selection?.kind === 'commit' ? selection.hash : null;

  return (
    <div className="flex size-full min-h-0 bg-[var(--bg-base)]">
      {/* ── Changes + history ─────────────────────────────────── */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--bg-surface)]">
        <div className="flex h-7 shrink-0 items-center justify-between px-3">
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Git</span>
          <button
            type="button"
            aria-label="Refresh"
            onClick={() => workspaceId && void refreshAll(workspaceId)}
            className="flex size-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
          >
            <RefreshCw className="size-3" />
          </button>
        </div>

        <BranchRow commits={commits} />

        {/* Changes takes up to half the height, then scrolls. */}
        <div className="flex max-h-[50%] min-h-0 flex-col border-t border-[var(--border-subtle)]">
          <SectionHeader label="Changes" count={files.length} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <EmptyRow>No changes</EmptyRow>
            ) : (
              files.map((file) => (
                <FileRow
                  key={file.path}
                  file={file}
                  selected={selectedPath === file.path}
                  onSelect={() => selectFile(file)}
                  onOpenInEditor={() => openInEditor(file)}
                />
              ))
            )}
          </div>
        </div>

        {/* History takes the remainder, and scrolls too. */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-[var(--border-subtle)]">
          <SectionHeader label="History" />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {commits.length === 0 ? (
              <EmptyRow>No commits yet</EmptyRow>
            ) : (
              commits.map((commit) => (
                <CommitRow
                  key={commit.fullSha || commit.sha}
                  commit={commit}
                  selected={selectedHash === (commit.fullSha || commit.sha)}
                  onSelect={() => selectCommit(commit)}
                />
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void openSeroApp('git')}
          className="flex h-7 shrink-0 items-center gap-1.5 border-t border-[var(--border-subtle)] px-3 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        >
          <GitBranch className="size-3" />
          Open Git
          <span className="flex-1" />
          <ArrowUpRight className="size-3" />
        </button>
      </div>

      {/* ── Diff ──────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {selection ? (
          <DiffPane
            workspaceId={workspaceId}
            repoPath={repoPath}
            selection={selection}
            diffStyle="unified"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <p className="max-w-xs text-xs text-[var(--text-muted)]">
              Pick a change or a commit to see what it did.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The branch and its sync counts — a statement of where you are, not controls. */
function BranchRow({ commits }: { commits: CommitEntry[] }) {
  const branch = commits.find((commit) => commit.isWorkingCopy)?.branches[0]
    ?? commits[0]?.branches[0]
    ?? 'detached';
  return (
    <div className="flex h-[26px] shrink-0 items-center gap-2 px-3">
      <GitBranch className="size-3 shrink-0 text-[var(--text-muted)]" />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">{branch}</span>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[26px] items-center px-3 text-xs text-[var(--text-muted)]">{children}</div>
  );
}

// The host's federation loader resolves exposed modules by default export.
export default ExplorerGitView;
