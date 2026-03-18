/**
 * Header bar — repo name, current branch, action buttons.
 */

import type { GitAppState } from '../../shared/types';

interface HeaderProps {
  state: GitAppState;
  onAction: (prompt: string) => void;
}

export function Header({ state, onAction }: HeaderProps) {
  const { repoName, currentBranch, branches, commitCount, fileChanges } = state;
  const staged = fileChanges.filter((f) => f.staged).length;
  const unstaged = fileChanges.filter((f) => !f.staged).length;
  const branch = branches.find((b) => b.current);

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--g-border)]">
      {/* Left: repo info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--g-accent)]">
            <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="8" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M4 6V10L8 11M12 6V10L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h1 className="text-sm font-semibold text-[var(--g-text)] tracking-tight">
            {repoName || 'Git'}
          </h1>
        </div>
        {currentBranch && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--g-glow)] border border-[var(--g-border)]">
            <BranchIcon />
            <span className="text-xs font-medium text-[var(--g-accent)] git-mono">
              {currentBranch}
            </span>
            {branch && (branch.ahead > 0 || branch.behind > 0) && (
              <span className="text-[10px] text-[var(--g-muted)] ml-0.5">
                {branch.ahead > 0 && <span className="text-[var(--g-green)]">+{branch.ahead}</span>}
                {branch.ahead > 0 && branch.behind > 0 && ' '}
                {branch.behind > 0 && <span className="text-[var(--g-red)]">-{branch.behind}</span>}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-[11px] text-[var(--g-dim)]">
          {commitCount > 0 && <span>{commitCount} commits</span>}
          {(staged > 0 || unstaged > 0) && (
            <>
              <span>·</span>
              {staged > 0 && <span className="text-[var(--g-green)]">{staged} staged</span>}
              {unstaged > 0 && <span className="text-[var(--g-yellow)]">{unstaged} changed</span>}
            </>
          )}
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1.5">
        <ActionBtn label="Fetch" icon="fetch" onClick={() => onAction('Using the git_manager tool: fetch from all remotes')} />
        <ActionBtn label="Pull" icon="pull" onClick={() => onAction('Using the git_manager tool: pull from remote')} />
        <ActionBtn label="Push" icon="push" onClick={() => onAction('Using the git_manager tool: push to remote')} />
        <div className="w-px h-4 bg-[var(--g-border)] mx-1" />
        <ActionBtn
          label="Refresh"
          icon="refresh"
          onClick={() => onAction('Using the git_manager tool: refresh')}
        />
      </div>
    </div>
  );
}

// ── Action button ───────────────────────────────────────────

function ActionBtn({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md
        text-[var(--g-muted)] border border-[var(--g-border)]
        hover:text-[var(--g-text)] hover:bg-[var(--g-elevated)] hover:border-[var(--g-border-bright)]
        transition-all duration-150 cursor-pointer"
    >
      <ActionIcon type={icon} />
      {label}
    </button>
  );
}

function ActionIcon({ type }: { type: string }) {
  const cn = "w-3.5 h-3.5";
  switch (type) {
    case 'fetch':
      return <svg className={cn} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v10M4 8l4 4 4-4" /></svg>;
    case 'pull':
      return <svg className={cn} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v8M5 7l3 3 3-3M3 13h10" /></svg>;
    case 'push':
      return <svg className={cn} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 12V4M5 7l3-3 3 3M3 13h10" /></svg>;
    case 'refresh':
      return <svg className={cn} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 8a6 6 0 0110.5-4M14 2v4h-4M14 8a6 6 0 01-10.5 4M2 14v-4h4" /></svg>;
    default:
      return null;
  }
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--g-accent)]">
      <path d="M5 3v6a3 3 0 003 3h1M11 3v4" />
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="11" cy="9" r="1.5" />
    </svg>
  );
}
