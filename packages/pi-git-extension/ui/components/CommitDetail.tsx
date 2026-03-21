/**
 * Commit detail panel — shown when a commit is selected.
 *
 * Displays commit metadata, stats, and changed files.
 */

import type { CommitNode, FileDiff, GitManagerRequest } from '../../shared/types';

interface CommitDetailProps {
  commit: CommitNode | null;
  diffs: FileDiff[];
  onSelectFile: (diff: FileDiff) => void;
  onClose: () => void;
  onAction: (action: GitManagerRequest) => void;
}

export function CommitDetail({ commit, diffs, onSelectFile, onClose, onAction }: CommitDetailProps) {
  if (!commit) return null;

  const totalAdd = diffs.reduce((s, d) => s + d.additions, 0);
  const totalDel = diffs.reduce((s, d) => s + d.deletions, 0);
  const date = new Date(commit.authorDate);

  return (
    <div className="border-t border-[var(--g-border)] bg-[var(--g-surface)]">
      {/* Commit header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-[var(--g-border)]">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="git-mono text-xs text-[var(--g-accent)] bg-[var(--g-glow)] px-1.5 py-0.5 rounded border border-[var(--g-border)]">
              {commit.shortHash}
            </span>
            {commit.refs.map((ref) => (
              <span
                key={ref.name}
                className="text-[9px] font-medium px-1.5 py-0.5 rounded git-mono"
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
          <p className="text-sm text-[var(--g-text)] font-medium leading-snug">{commit.subject}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-[var(--g-muted)]">
            <span className="font-medium text-[var(--g-text)]">{commit.authorName}</span>
            <span>{date.toLocaleDateString()} {date.toLocaleTimeString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={() => onAction({ action: 'cherry_pick', hash: commit.hash })}
            className="px-2 py-1 text-[10px] text-[var(--g-muted)] border border-[var(--g-border)]
              rounded hover:bg-[var(--g-elevated)] hover:text-[var(--g-text)] transition-colors cursor-pointer"
          >
            Cherry-pick
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[var(--g-dim)] hover:text-[var(--g-text)] transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* File list */}
      <div className="max-h-48 overflow-y-auto git-scrollbar">
        {/* Summary bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--g-border)] bg-[var(--g-bg)]">
          <span className="text-[11px] text-[var(--g-muted)]">
            {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
          </span>
          {totalAdd > 0 && <span className="text-[11px] text-[var(--g-green)]">+{totalAdd}</span>}
          {totalDel > 0 && <span className="text-[11px] text-[var(--g-red)]">-{totalDel}</span>}
          <StatBar additions={totalAdd} deletions={totalDel} />
        </div>

        {diffs.map((diff) => (
          <FileRow key={diff.path} diff={diff} onClick={() => onSelectFile(diff)} />
        ))}
      </div>
    </div>
  );
}

// ── File row ────────────────────────────────────────────────

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
  const dir = diff.path.includes('/') ? diff.path.substring(0, diff.path.lastIndexOf('/') + 1) : '';
  const file = diff.path.includes('/') ? diff.path.substring(diff.path.lastIndexOf('/') + 1) : diff.path;

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-1.5 hover:bg-[var(--g-hover)] cursor-pointer
        border-b border-[var(--g-border)] last:border-b-0"
    >
      <span
        className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold shrink-0"
        style={{ background: `${statusColor}18`, color: statusColor }}
      >
        {statusLabel}
      </span>
      <span className="text-[11px] text-[var(--g-dim)] git-mono truncate">{dir}</span>
      <span className="text-[11px] text-[var(--g-text)] git-mono truncate">{file}</span>
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        {diff.additions > 0 && <span className="text-[10px] text-[var(--g-green)]">+{diff.additions}</span>}
        {diff.deletions > 0 && <span className="text-[10px] text-[var(--g-red)]">-{diff.deletions}</span>}
      </div>
    </div>
  );
}

// ── Stat bar ────────────────────────────────────────────────

function StatBar({ additions, deletions }: { additions: number; deletions: number }) {
  const total = additions + deletions;
  if (total === 0) return null;
  const addPct = (additions / total) * 100;
  const blocks = 5;
  const addBlocks = Math.round((addPct / 100) * blocks);

  return (
    <div className="flex gap-0.5 ml-auto">
      {Array.from({ length: blocks }, (_, i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-sm"
          style={{ background: i < addBlocks ? 'var(--g-green)' : 'var(--g-red)', opacity: 0.6 }}
        />
      ))}
    </div>
  );
}
