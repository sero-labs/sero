/**
 * Staging area, file changes with stage/unstage controls and commit form.
 *
 * Split into two sections: unstaged changes and staged changes,
 * with a commit message input at the bottom.
 */

import { useCallback, useState } from 'react';
import type { FileChange, GitManagerRequest } from '../../shared/types';

interface StagingAreaProps {
  fileChanges: FileChange[];
  onAction: (action: GitManagerRequest) => void;
  onSelectFile: (path: string, staged: boolean) => void;
}

export function StagingArea({ fileChanges, onAction, onSelectFile }: StagingAreaProps) {
  const [commitMsg, setCommitMsg] = useState('');
  const staged = fileChanges.filter((f) => f.staged);
  const unstaged = fileChanges.filter((f) => !f.staged);

  const handleCommit = useCallback(() => {
    const msg = commitMsg.trim();
    if (!msg) return;
    onAction({ action: 'commit', message: msg });
    setCommitMsg('');
  }, [commitMsg, onAction]);

  const handleStageAll = useCallback(() => {
    onAction({ action: 'stage', all: true });
  }, [onAction]);

  const handleUnstageAll = useCallback(() => {
    onAction({ action: 'unstage', all: true });
  }, [onAction]);

  if (fileChanges.length === 0) {
    return (
      <div className="border-t border-[var(--g-border)] bg-[var(--g-surface)] px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--g-dim)]">
          <CheckIcon />
          <span>Working tree clean</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--g-border)] bg-[var(--g-surface)] flex max-h-72 flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <ChangeColumn
          title="UNSTAGED"
          count={unstaged.length}
          className="border-r border-[var(--g-border)]"
          action={unstaged.length > 0 ? {
            label: 'Stage all',
            onClick: handleStageAll,
            tone: 'accent',
          } : undefined}
        >
          {unstaged.map((f) => (
            <ChangeRow
              key={`${f.path}:unstaged:${f.status}`}
              file={f}
              onToggle={() => onAction({ action: 'stage', file: f.path })}
              onSelect={() => onSelectFile(f.path, false)}
              actionLabel="+"
            />
          ))}
        </ChangeColumn>

        <ChangeColumn
          title="STAGED"
          count={staged.length}
          action={staged.length > 0 ? {
            label: 'Unstage all',
            onClick: handleUnstageAll,
            tone: 'muted',
          } : undefined}
        >
          {staged.map((f) => (
            <ChangeRow
              key={`${f.path}:staged:${f.status}`}
              file={f}
              onToggle={() => onAction({ action: 'unstage', file: f.path })}
              onSelect={() => onSelectFile(f.path, true)}
              actionLabel="-"
            />
          ))}
        </ChangeColumn>
      </div>

      {/* Commit input */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-t border-[var(--g-border)] bg-[var(--g-bg)]">
        <input aria-label="Commit message"
          type="text"
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleCommit(); }}
          placeholder="Commit message..."
          className="flex-1 bg-[var(--g-elevated)] border border-[var(--g-border)] rounded-md px-3 py-1.5
            text-xs text-[var(--g-text)] placeholder-[var(--g-dim)] outline-none
            focus:border-[var(--g-accent)] transition-colors git-mono"
        />
        <button type="button"
          onClick={handleCommit}
          disabled={!commitMsg.trim() || staged.length === 0}
          className="px-3 py-1.5 text-xs font-medium rounded-md
            bg-[var(--g-accent)] text-white
            hover:opacity-90 disabled:opacity-30 disabled:cursor-default
            transition-opacity cursor-pointer"
        >
          Commit
        </button>
      </div>
    </div>
  );
}

interface ChangeColumnProps {
  title: string;
  count: number;
  className?: string;
  action?: {
    label: string;
    onClick: () => void;
    tone: 'accent' | 'muted';
  };
  children: React.ReactNode;
}

function ChangeColumn({ title, count, className = '', action, children }: ChangeColumnProps) {
  const actionClassName = action?.tone === 'accent'
    ? 'text-[var(--g-accent)] hover:text-[var(--g-accent-hover)]'
    : 'text-[var(--g-muted)] hover:text-[var(--g-text)]';

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${className}`.trim()}>
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-[var(--g-border)] bg-[var(--g-bg)]">
        <span className="text-sm font-semibold tracking-wider text-[var(--g-dim)]">
          {title} ({count})
        </span>
        {action && (
          <button type="button"
            onClick={action.onClick}
            className={`text-sm transition-colors cursor-pointer ${actionClassName}`}
          >
            {action.label}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto git-scrollbar">
        {children}
      </div>
    </div>
  );
}

// ── Change row ──────────────────────────────────────────────

function ChangeRow({
  file, onToggle, onSelect, actionLabel,
}: {
  file: FileChange; onToggle: () => void; onSelect: () => void; actionLabel: string;
}) {
  const statusColor = {
    added: 'var(--g-green)',
    modified: 'var(--g-yellow)',
    deleted: 'var(--g-red)',
    renamed: 'var(--g-blue)',
    copied: 'var(--g-blue)',
    untracked: 'var(--g-dim)',
  }[file.status];

  const fileName = file.path.includes('/')
    ? file.path.substring(file.path.lastIndexOf('/') + 1)
    : file.path;
  const dir = file.path.includes('/')
    ? file.path.substring(0, file.path.lastIndexOf('/') + 1)
    : '';

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 hover:bg-[var(--g-hover)] group">
      <button type="button"
        onClick={onToggle}
        className="size-5 rounded flex items-center justify-center text-sm font-bold
          border border-[var(--g-border)] text-[var(--g-muted)]
          hover:border-[var(--g-accent)] hover:text-[var(--g-accent)]
          transition-colors cursor-pointer shrink-0"
      >
        {actionLabel}
      </button>
      <div
        onClick={onSelect}
        className="flex items-center gap-1 min-w-0 flex-1 cursor-pointer"
      >
        <span
          className="size-1.5 rounded-full shrink-0"
          style={{ background: statusColor }}
        />
        <span className="text-sm text-[var(--g-dim)] git-mono truncate">{dir}</span>
        <span className="text-sm text-[var(--g-text)] git-mono truncate">{fileName}</span>
      </div>
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--g-green)" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 6l2 2 4-4" />
    </svg>
  );
}
