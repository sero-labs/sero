/**
 * Changes panel — what the agent changed, and a way to commit it.
 *
 * The list shows every changed file in the active workspace. Tapping one
 * opens its diff. The status is refetched whenever a turn finishes,
 * because a turn is what changes files.
 */

import { useEffect } from 'react';
import { GitBranch, RefreshCw, FileDiff } from 'lucide-react';
import { EmptyState } from '@sero-ai/ui';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import { cn } from '@sero-ai/ui/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace';
import { diffKey, selectFiles, useGitStore, type GitFile } from '@/stores/git';
import { DiffView } from './DiffView';
import { CommitBar } from './CommitBar';

/** One letter per status, as git writes it. */
const STATUS_MARK: Record<GitFile['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
  untracked: '?',
  conflict: 'U',
};

const STATUS_TONE: Record<GitFile['status'], string> = {
  added: 'text-status-success',
  modified: 'text-status-info',
  deleted: 'text-status-error',
  renamed: 'text-status-info',
  copied: 'text-status-info',
  untracked: 'text-[var(--text-muted)]',
  conflict: 'text-status-warning',
};

export function ChangesPanel() {
  const workspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  // Until the store has moved to the active workspace, what it holds is
  // another workspace's tree, and must not be drawn under this one.
  const current = useGitStore((s) => s.workspaceId === workspaceId);
  const status = useGitStore((s) => (current ? s.status : null));
  const loading = useGitStore((s) => (current ? s.loading : true));
  const error = useGitStore((s) => (current ? s.error : null));
  const openPath = useGitStore((s) => (current ? s.openPath : null));
  const diffs = useGitStore((s) => s.diffs);
  const refresh = useGitStore((s) => s.refresh);
  const openFile = useGitStore((s) => s.openFile);
  const closeFile = useGitStore((s) => s.closeFile);

  // Fetching on mount is an external side effect: the panel only exists
  // once the user opens it, so there is no earlier point to ask.
  useEffect(() => {
    if (workspaceId) refresh(workspaceId);
  }, [workspaceId, refresh]);

  if (!workspaceId) {
    return (
      <EmptyState icon={GitBranch} title="No workspace" message="Pick a workspace first." />
    );
  }

  const files = selectFiles(status);
  const openFileEntry = files.find((file) => file.path === openPath);

  if (openPath && openFileEntry) {
    return (
      <DiffView
        path={openPath}
        diff={diffs[diffKey(openFileEntry.path, openFileEntry.staged)]}
        onBack={closeFile}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <Header workspaceId={workspaceId} loading={loading} />

      {error && files.length === 0 && (
        <p className="px-2 py-1 text-xs text-status-error">{error}</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <EmptyState
            icon={FileDiff}
            title={loading ? 'Reading the working tree…' : 'No changes'}
            message={loading ? '' : 'Every file matches the last commit.'}
          />
        ) : (
          <ul className="flex flex-col py-1">
            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                onOpen={() => openFile(workspaceId, file)}
              />
            ))}
          </ul>
        )}
      </div>

      {files.length > 0 && <CommitBar workspaceId={workspaceId} branch={status?.branch ?? ''} />}
    </div>
  );
}

function Header({ workspaceId, loading }: { workspaceId: string; loading: boolean }) {
  const status = useGitStore((s) => s.status);
  const refresh = useGitStore((s) => s.refresh);
  const selectedCount = useGitStore((s) => s.selectedPaths.length);
  const selectAll = useGitStore((s) => s.selectAll);
  const clearSelection = useGitStore((s) => s.clearSelection);

  const fileCount = selectFiles(status).length;

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-2 py-1.5">
      <GitBranch className="size-3.5 shrink-0 text-[var(--text-muted)]" />
      <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]">
        {status?.detached ? 'detached HEAD' : status?.branch || '—'}
        {status && status.ahead > 0 && <span className="text-[var(--text-muted)]"> ↑{status.ahead}</span>}
        {status && status.behind > 0 && <span className="text-[var(--text-muted)]"> ↓{status.behind}</span>}
      </span>

      {fileCount > 0 && (
        <button
          type="button"
          onClick={() => (selectedCount === fileCount ? clearSelection() : selectAll())}
          className="shrink-0 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {selectedCount === fileCount ? 'None' : 'All'}
        </button>
      )}

      <Button
        variant="ghost"
        size="icon-xs"
        title="Refresh"
        aria-label="Refresh the working tree"
        onClick={() => refresh(workspaceId)}
      >
        <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
      </Button>
    </div>
  );
}

function FileRow({ file, onOpen }: { file: GitFile; onOpen: () => void }) {
  const selected = useGitStore((s) => s.selectedPaths.includes(file.path));
  const toggleSelected = useGitStore((s) => s.toggleSelected);

  return (
    <li className="flex items-center gap-2 px-2 py-1 hover:bg-[var(--bg-elevated)]">
      <Checkbox
        checked={selected}
        onCheckedChange={() => toggleSelected(file.path)}
        aria-label={`Select ${file.path}`}
        className="shrink-0"
      />
      <button
        type="button"
        data-testid="changed-file"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className={cn('w-3 shrink-0 font-mono text-xs', STATUS_TONE[file.status])}>
          {STATUS_MARK[file.status]}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]" title={file.path}>
          {file.path}
        </span>
        {file.staged && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
            staged
          </span>
        )}
      </button>
    </li>
  );
}
