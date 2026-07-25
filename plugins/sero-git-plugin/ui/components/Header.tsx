/**
 * Header bar, repo name, current branch, action buttons.
 */

import { Github } from 'lucide-react';
import type { GitAppState, GitManagerRequest } from '../../shared/types';

interface HeaderProps {
  state: GitAppState;
  onAction: (action: GitManagerRequest) => void;
  /** GitHub sign-in lives here, so the PR pane never has to host it (§3). */
  github: { ready: boolean; authenticated: boolean; username?: string; signIn: () => void };
  onOpenPullRequest: () => void;
}

export function Header({ state, onAction, github, onOpenPullRequest }: HeaderProps) {
  const { repoName, currentBranch, branches, commitCount, fileChanges } = state;
  const staged = fileChanges.filter((f) => f.staged).length;
  const unstaged = fileChanges.filter((f) => !f.staged).length;
  const branch = branches.find((b) => b.current);
  const syncLabel = getSyncLabel(state);
  const syncTone = getSyncTone(state);
  const refreshedAt = formatRefreshTime(state.lastRefresh);

  return (
    <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-subtle)]">
      {/* Left: repo info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--brand-secondary)]">
            <circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="8" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M4 6V10L8 11M12 6V10L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <h1 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
            {repoName || 'Git'}
          </h1>
        </div>
        {currentBranch && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--brand-secondary-faint)] border border-[var(--border-subtle)]">
            <BranchIcon />
            <span className="text-xs font-medium text-[var(--brand-secondary)] git-mono">
              {currentBranch}
            </span>
            {branch && (branch.ahead > 0 || branch.behind > 0) && (
              <span className="text-sm text-[var(--text-secondary)] ml-0.5">
                {branch.ahead > 0 && <span className="text-[var(--status-success)]">+{branch.ahead}</span>}
                {branch.ahead > 0 && branch.behind > 0 && ' '}
                {branch.behind > 0 && <span className="text-[var(--status-error)]">-{branch.behind}</span>}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          {commitCount > 0 && <span>{commitCount} commits</span>}
          {(staged > 0 || unstaged > 0) && (
            <>
              <span>·</span>
              {staged > 0 && <span className="text-[var(--status-success)]">{staged} staged</span>}
              {unstaged > 0 && <span className="text-[var(--status-warning)]">{unstaged} changed</span>}
            </>
          )}
        </div>
      </div>

      {/* Right: sync status + action buttons */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1"
          title={state.error ? state.error : `Last update: ${state.lastRefresh}`}
        >
          <span
            className={`size-1.5 rounded-full ${syncTone.dot} ${state.syncMode === 'watch' && !state.error ? 'animate-pulse' : ''}`}
          />
          <span className={`text-sm font-semibold uppercase tracking-[0.18em] ${syncTone.text}`}>
            {syncLabel}
          </span>
          <span className="text-sm text-[var(--text-muted)]">{refreshedAt}</span>
        </div>

        <div className="w-px h-4 bg-[var(--border-subtle)]" />

        <GitHubControl github={github} onOpenPullRequest={onOpenPullRequest} />

        <div className="w-px h-4 bg-[var(--border-subtle)]" />

        <ActionBtn label="Refresh" icon="refresh" onClick={() => onAction({ action: 'refresh' })} />
        <ActionBtn label="Fetch" icon="fetch" onClick={() => onAction({ action: 'fetch' })} />
        <ActionBtn label="Pull" icon="pull" onClick={() => onAction({ action: 'pull' })} />
        <ActionBtn label="Push" icon="push" onClick={() => onAction({ action: 'push' })} />
      </div>
    </div>
  );
}

// ── GitHub ──────────────────────────────────────────────────

function GitHubControl({
  github, onOpenPullRequest,
}: {
  github: HeaderProps['github'];
  onOpenPullRequest: () => void;
}) {
  if (!github.ready) return null;

  // Sign-in lives here so the PR pane never has to host it — but the pane is
  // still reachable when signed out, where it explains why the button is
  // disabled rather than hiding itself (§3).
  return (
    <>
      {!github.authenticated && (
        <button type="button"
          onClick={github.signIn}
          title="Sign in to GitHub"
          className={GITHUB_BTN}
        >
          <Github className="size-3.5" />
          Sign in
        </button>
      )}
      <button type="button"
        onClick={onOpenPullRequest}
        title={github.username ? `Signed in as ${github.username}` : 'Create a pull request'}
        className={GITHUB_BTN}
      >
        <Github className="size-3.5" />
        Pull request
      </button>
    </>
  );
}

const GITHUB_BTN = `flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-sm font-medium
  text-[var(--text-secondary)] transition-all duration-150 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]`;

// ── Action button ───────────────────────────────────────────

function ActionBtn({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button type="button"
      onClick={onClick}
      title={label}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md
        text-[var(--text-secondary)] border border-[var(--border-subtle)]
        hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-default)]
        transition-all duration-150 cursor-pointer"
    >
      <ActionIcon type={icon} />
      {label}
    </button>
  );
}

function ActionIcon({ type }: { type: string }) {
  const cn = "size-3.5";
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

function getSyncLabel(state: GitAppState): string {
  if (state.loading) return 'Syncing';
  if (state.error) return 'Issue';
  if (state.syncMode === 'watch') return 'Live';
  return 'Manual';
}

function getSyncTone(state: GitAppState): { dot: string; text: string } {
  if (state.error) {
    return {
      dot: 'bg-[var(--status-error)]',
      text: 'text-[var(--status-error)]',
    };
  }
  if (state.syncMode === 'watch') {
    return {
      dot: 'bg-[var(--status-success)]',
      text: 'text-[var(--status-success)]',
    };
  }
  return {
    dot: 'bg-[var(--status-warning)]',
    text: 'text-[var(--status-warning)]',
  };
}

function formatRefreshTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-[var(--brand-secondary)]">
      <path d="M5 3v6a3 3 0 003 3h1M11 3v4" />
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="11" cy="9" r="1.5" />
    </svg>
  );
}
