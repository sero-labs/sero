/**
 * Commit detail panel, shown when a commit is selected.
 *
 * Displays commit metadata, stats, and changed files.
 */

import { useState } from 'react';
import type { CommitNode, FileDiff, GitManagerRequest } from '../../shared/types';

interface CommitDetailProps {
  commit: CommitNode | null;
  diffs: FileDiff[];
  hasWorkingTreeChanges: boolean;
  onSelectFile: (diff: FileDiff) => void;
  onClose: () => void;
  onAction: (action: GitManagerRequest) => void;
}

export function CommitDetail({
  commit,
  diffs,
  hasWorkingTreeChanges,
  onSelectFile,
  onClose,
  onAction,
}: CommitDetailProps) {
  const [confirmCherryPick, setConfirmCherryPick] = useState(false);

  if (!commit) return null;

  const date = new Date(commit.authorDate);

  const handleCherryPick = () => {
    if (hasWorkingTreeChanges) {
      setConfirmCherryPick(true);
      return;
    }
    onAction({ action: 'cherry_pick', hash: commit.hash });
  };

  const handleAutoStashCherryPick = () => {
    onAction({ action: 'cherry_pick', hash: commit.hash, all: true });
    setConfirmCherryPick(false);
  };

  return (
    <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex items-start justify-between border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="rounded border border-[var(--border-subtle)] bg-[var(--brand-secondary-faint)] px-1.5 py-0.5 text-xs text-[var(--brand-secondary)] git-mono">
              {commit.shortHash}
            </span>
            {commit.refs.map((ref) => (
              <span
                key={ref.name}
                className="rounded px-1.5 py-0.5 text-xs font-medium git-mono"
                style={{
                  background: ref.type === 'tag' ? 'rgba(251,191,36,0.12)' : 'rgba(129,140,248,0.12)',
                  color: ref.type === 'tag' ? '#fbbf24' : '#818cf8',
                  border: `1px solid ${ref.type === 'tag' ? 'rgba(251,191,36,0.25)' : 'rgba(129,140,248,0.25)'}`,
                }}
              >
                {ref.name}
              </span>
            ))}
          </div>
          <p className="text-base font-medium leading-snug text-[var(--text-primary)]">{commit.subject}</p>
          <div className="mt-2 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{commit.authorName}</span>
            <span>{date.toLocaleDateString()} {date.toLocaleTimeString()}</span>
          </div>
          {confirmCherryPick && (
            <div className="mt-3 rounded-md border border-[var(--status-warning)]/25 bg-[var(--bg-base)] px-3 py-2">
              <div className="text-sm font-medium text-[var(--text-primary)]">
                Your working tree has uncommitted changes.
              </div>
              <div className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                Auto-stash your current changes before cherry-picking this commit. If the cherry-pick conflicts,
                the error toast will include next-step guidance.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button"
                  onClick={handleAutoStashCherryPick}
                  className="rounded border border-[var(--border-subtle)] px-2 py-1 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                >
                  Auto-stash + cherry-pick
                </button>
                <button type="button"
                  onClick={() => setConfirmCherryPick(false)}
                  className="rounded px-2 py-1 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-2">
          <button type="button"
            onClick={handleCherryPick}
            className="rounded border border-[var(--border-subtle)] px-2 py-1 text-sm text-[var(--text-secondary)]
              transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
          >
            {hasWorkingTreeChanges ? 'Cherry-pick…' : 'Cherry-pick'}
          </button>
          <button type="button"
            aria-label="Close commit details"
            onClick={onClose}
            className="cursor-pointer p-1 text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto git-scrollbar">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2">
          <span className="text-sm text-[var(--text-secondary)]">
            {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
          </span>
        </div>

        {diffs.map((diff) => (
          <FileRow key={`${diff.oldPath ?? diff.path}:${diff.path}`} diff={diff} onClick={() => onSelectFile(diff)} />
        ))}
      </div>
    </div>
  );
}

function FileRow({ diff, onClick }: { diff: FileDiff; onClick: () => void }) {
  const statusColor = {
    added: 'var(--status-success)',
    modified: 'var(--status-warning)',
    deleted: 'var(--status-error)',
    renamed: 'var(--status-info)',
    copied: 'var(--status-info)',
    untracked: 'var(--text-muted)',
    conflict: 'var(--status-error)',
  }[diff.status];

  const statusLabel = diff.status[0].toUpperCase();
  const primaryLabel = diff.path.includes('/')
    ? diff.path.substring(diff.path.lastIndexOf('/') + 1)
    : diff.path;
  const secondaryLabel = diff.oldPath && diff.oldPath !== diff.path
    ? `${diff.oldPath} → ${diff.path}`
    : diff.path;

  return (
    <div
      onClick={onClick}
      className="flex cursor-pointer items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-1.5 hover:bg-[var(--bg-elevated)] last:border-b-0"
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded text-xs font-bold"
        style={{ background: `${statusColor}18`, color: statusColor }}
      >
        {statusLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-[var(--text-primary)] git-mono">{primaryLabel}</div>
        <div className="truncate text-sm text-[var(--text-muted)] git-mono">{secondaryLabel}</div>
      </div>
    </div>
  );
}
