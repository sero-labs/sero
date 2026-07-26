/**
 * The selected commit, shown in the middle column in place of the working tree.
 *
 * It used to be a band pinned across the whole foot of the app, which squeezed
 * everything above it and could not grow: a commit touching thirty files got
 * the same 12 lines as one touching two. Here it has a full column of height,
 * and its file list behaves exactly like the working tree's — click a file, see
 * the diff on the right — because it is doing the same job.
 *
 * The column shows one or the other, never both, so closing it is how you get
 * back to what you were working on.
 */

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { CommitNode, FileDiff, GitManagerRequest } from '../../shared/types';
import { statusColour } from '../lib/file-status';

interface CommitDetailProps {
  commit: CommitNode;
  diffs: FileDiff[];
  /** The files are still being fetched, as opposed to there being none. */
  loading: boolean;
  hasWorkingTreeChanges: boolean;
  selectedPath?: string | null;
  onSelectFile: (diff: FileDiff) => void;
  onClose: () => void;
  onAction: (action: GitManagerRequest) => void;
}

export function CommitDetail({
  commit,
  diffs,
  loading,
  hasWorkingTreeChanges,
  selectedPath,
  onSelectFile,
  onClose,
  onAction,
}: CommitDetailProps) {
  const [confirmCherryPick, setConfirmCherryPick] = useState(false);

  const date = new Date(commit.authorDate);

  const handleCherryPick = () => {
    // Cherry-picking over uncommitted work can lose it, so it asks first.
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
    <div className="flex size-full min-h-0 flex-col bg-[var(--bg-surface)]">
      {/* The way back to the working tree, in the place the panel replaced. */}
      <div className="flex h-6 shrink-0 items-center gap-1.5 px-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close commit details"
          className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
        >
          <ArrowLeft className="size-3" />
          Working tree
        </button>
      </div>

      <div className="shrink-0 border-b border-[var(--border-subtle)] px-3 pb-2">
        <p className="text-[0.84rem] leading-snug text-[var(--text-primary)]">{commit.subject}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className="git-mono text-[var(--brand-secondary)]">{commit.shortHash}</span>
          <span className="text-[var(--text-secondary)]">{commit.authorName}</span>
          <span>{date.toLocaleDateString()} {date.toLocaleTimeString()}</span>
        </div>
        {commit.refs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {commit.refs.map((ref) => (
              <RefChip key={ref.name} name={ref.name} isTag={ref.type === 'tag'} />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleCherryPick}
          className="mt-2 rounded border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-secondary)]
            transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          {hasWorkingTreeChanges ? 'Cherry-pick…' : 'Cherry-pick'}
        </button>

        {confirmCherryPick && (
          <div className="mt-2 rounded-md border border-[var(--status-warning)]/25 bg-[var(--bg-base)] px-2 py-1.5">
            <div className="text-xs leading-relaxed text-[var(--text-secondary)]">
              You have uncommitted changes. They can be stashed first, and put back afterwards.
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAutoStashCherryPick}
                className="rounded border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
              >
                Auto-stash + cherry-pick
              </button>
              <button
                type="button"
                onClick={() => setConfirmCherryPick(false)}
                className="px-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="sticky top-0 flex h-6 shrink-0 items-center gap-1.5 px-3">
        <span className="text-xs font-medium tracking-wide text-[var(--text-muted)]">Files</span>
        {!loading && <span className="text-xs text-[var(--text-muted)]/70">{diffs.length}</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto git-scrollbar">
        {diffs.map((diff) => (
          <FileRow
            key={`${diff.oldPath ?? diff.path}:${diff.path}`}
            diff={diff}
            selected={selectedPath === diff.path}
            onClick={() => onSelectFile(diff)}
          />
        ))}
        {diffs.length === 0 && (
          <div className="flex h-[26px] items-center px-3 text-xs text-[var(--text-muted)]">
            {loading ? 'Reading this commit…' : 'This commit changed no files'}
          </div>
        )}
      </div>
    </div>
  );
}

function RefChip({ name, isTag }: { name: string; isTag: boolean }) {
  return (
    <span
      className="truncate rounded px-1.5 py-0.5 text-xs git-mono"
      title={name}
      style={{
        background: isTag ? 'var(--status-warning-faint)' : 'var(--brand-secondary-faint)',
        color: isTag ? 'var(--status-warning)' : 'var(--brand-secondary)',
      }}
    >
      {name}
    </span>
  );
}

/** The same row the working tree uses, so the two lists read as one thing. */
function FileRow({
  diff, selected, onClick,
}: {
  diff: FileDiff;
  selected: boolean;
  onClick: () => void;
}) {
  const renamed = diff.oldPath && diff.oldPath !== diff.path;
  const slash = diff.path.lastIndexOf('/');
  const dir = slash === -1 ? '' : diff.path.slice(0, slash + 1);
  const name = slash === -1 ? diff.path : diff.path.slice(slash + 1);

  return (
    <div
      onClick={onClick}
      title={renamed ? `${diff.oldPath} → ${diff.path}` : diff.path}
      className={`flex h-[26px] cursor-pointer items-center gap-2 px-3 hover:bg-[var(--bg-elevated)] ${
        selected ? 'bg-[var(--bg-overlay)]' : ''
      }`}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: statusColour(diff.status) }}
      />
      <span className="min-w-0 flex-1 truncate text-[0.84rem] text-[var(--text-secondary)]">
        {dir && <span className="text-[var(--text-muted)]">{dir}</span>}
        {name}
      </span>
    </div>
  );
}
