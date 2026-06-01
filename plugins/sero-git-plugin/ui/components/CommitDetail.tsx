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

  const totalAdd = diffs.reduce((sum, diff) => sum + diff.additions, 0);
  const totalDel = diffs.reduce((sum, diff) => sum + diff.deletions, 0);
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
    <div className="border-t border-[var(--g-border)] bg-[var(--g-surface)]">
      <div className="flex items-start justify-between border-b border-[var(--g-border)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="rounded border border-[var(--g-border)] bg-[var(--g-glow)] px-1.5 py-0.5 text-xs text-[var(--g-accent)] git-mono">
              {commit.shortHash}
            </span>
            {commit.refs.map((ref) => (
              <span
                key={ref.name}
                className="rounded px-1.5 py-0.5 text-[9px] font-medium git-mono"
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
          <p className="text-sm font-medium leading-snug text-[var(--g-text)]">{commit.subject}</p>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--g-muted)]">
            <span className="font-medium text-[var(--g-text)]">{commit.authorName}</span>
            <span>{date.toLocaleDateString()} {date.toLocaleTimeString()}</span>
          </div>
          {confirmCherryPick && (
            <div className="mt-3 rounded-md border border-[var(--g-yellow)]/25 bg-[var(--g-bg)] px-3 py-2">
              <div className="text-[11px] font-medium text-[var(--g-text)]">
                Your working tree has uncommitted changes.
              </div>
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--g-muted)]">
                Auto-stash your current changes before cherry-picking this commit. If the cherry-pick conflicts,
                the error toast will include next-step guidance.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button"
                  onClick={handleAutoStashCherryPick}
                  className="rounded border border-[var(--g-border)] px-2 py-1 text-[10px] text-[var(--g-text)] transition-colors hover:border-[var(--g-border-bright)] hover:bg-[var(--g-elevated)]"
                >
                  Auto-stash + cherry-pick
                </button>
                <button type="button"
                  onClick={() => setConfirmCherryPick(false)}
                  className="rounded px-2 py-1 text-[10px] text-[var(--g-dim)] transition-colors hover:text-[var(--g-text)]"
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
            className="rounded border border-[var(--g-border)] px-2 py-1 text-[10px] text-[var(--g-muted)]
              transition-colors hover:bg-[var(--g-elevated)] hover:text-[var(--g-text)]"
          >
            {hasWorkingTreeChanges ? 'Cherry-pick…' : 'Cherry-pick'}
          </button>
          <button type="button"
            aria-label="Close commit details"
            onClick={onClose}
            className="cursor-pointer p-1 text-[var(--g-dim)] transition-colors hover:text-[var(--g-text)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto git-scrollbar">
        <div className="flex items-center gap-3 border-b border-[var(--g-border)] bg-[var(--g-bg)] px-4 py-2">
          <span className="text-[11px] text-[var(--g-muted)]">
            {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
          </span>
          {totalAdd > 0 && <span className="text-[11px] text-[var(--g-green)]">+{totalAdd}</span>}
          {totalDel > 0 && <span className="text-[11px] text-[var(--g-red)]">-{totalDel}</span>}
          <StatBar additions={totalAdd} deletions={totalDel} />
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
    added: 'var(--g-green)',
    modified: 'var(--g-yellow)',
    deleted: 'var(--g-red)',
    renamed: 'var(--g-blue)',
    copied: 'var(--g-blue)',
    untracked: 'var(--g-dim)',
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
      className="flex cursor-pointer items-center gap-2 border-b border-[var(--g-border)] px-4 py-1.5 hover:bg-[var(--g-hover)] last:border-b-0"
    >
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded text-[9px] font-bold"
        style={{ background: `${statusColor}18`, color: statusColor }}
      >
        {statusLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] text-[var(--g-text)] git-mono">{primaryLabel}</div>
        <div className="truncate text-[10px] text-[var(--g-dim)] git-mono">{secondaryLabel}</div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {diff.additions > 0 && <span className="text-[10px] text-[var(--g-green)]">+{diff.additions}</span>}
        {diff.deletions > 0 && <span className="text-[10px] text-[var(--g-red)]">-{diff.deletions}</span>}
      </div>
    </div>
  );
}

function StatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  if (total === 0) return null;
  const addPct = (additions / total) * 100;
  const blocks = 5;
  const addBlocks = Math.round((addPct / 100) * blocks);

  return (
    <div className="ml-auto flex gap-0.5">
      {Array.from({ length: blocks }, (_, index) => (
        <div
          key={index}
          className="size-1.5 rounded-sm"
          style={{ background: index < addBlocks ? 'var(--g-green)' : 'var(--g-red)', opacity: 0.6 }}
        />
      ))}
    </div>
  );
}
