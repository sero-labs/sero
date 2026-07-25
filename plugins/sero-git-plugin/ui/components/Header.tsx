/**
 * Header bar, repo name, current branch, action buttons.
 */

import { Github } from 'lucide-react';
import type { GitAppState, GitManagerRequest } from '../../shared/types';
import { branchChipLabel, type RepoModeInfo } from '../lib/repo-mode';

interface HeaderProps {
  state: GitAppState;
  onAction: (action: GitManagerRequest) => void;
  /** GitHub sign-in lives here, so the PR pane never has to host it (§3). */
  github: { ready: boolean; authenticated: boolean; username?: string; signIn: () => void };
  onOpenPullRequest: () => void;
  /** Which hard state the repo is in, and what it makes unavailable (§7). */
  info: RepoModeInfo;
}

export function Header({ state, onAction, github, onOpenPullRequest, info }: HeaderProps) {
  const { repoName, branches, commitCount, fileChanges } = state;
  const staged = fileChanges.filter((f) => f.staged).length;
  const unstaged = fileChanges.filter((f) => !f.staged).length;
  const branch = branches.find((b) => b.current);
  const currentBranch = branchChipLabel(state, info.mode);
  const modeWord = MODE_WORD[info.mode];
  // When the watchers are alive the view keeps itself current and there is
  // nothing to say. When they are not, the one thing worth knowing is that this
  // is as fresh as it gets until you press Refresh — so it is Refresh that says
  // so, rather than a label sitting somewhere else (rule 21).
  const staleSince = state.syncMode === 'watch' ? null : formatRefreshTime(state.lastRefresh);

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
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--border-subtle)] ${
            info.mode === 'detached'
              ? 'bg-[var(--status-warning-faint)]'
              : 'bg-[var(--brand-secondary-faint)]'
          }`}>
            <BranchIcon detached={info.mode === 'detached'} />
            <span className={`text-xs font-medium git-mono ${
              info.mode === 'detached' ? 'text-[var(--status-warning)]' : 'text-[var(--brand-secondary)]'
            }`}>
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
          {/* The mode, in the vocabulary git uses for it. */}
          {modeWord && <span>{modeWord}</span>}
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
        <div className="w-px h-4 bg-[var(--border-subtle)]" />

        <GitHubControl
          github={github}
          onOpenPullRequest={onOpenPullRequest}
          hasRemote={state.remotes.length > 0}
          pullRequestBlockedReason={info.pullRequestBlockedReason}
        />

        <div className="w-px h-4 bg-[var(--border-subtle)]" />

        {/* Unavailable actions are disabled, not hidden (rule 20) — the reason
            is the banner when there is a mode, and the button beside them when
            the repository simply has no remote. */}
        <ActionBtn
          label="Refresh"
          icon="refresh"
          suffix={staleSince}
          title={staleSince
            ? `This view is not updating on its own. Last read at ${staleSince}.`
            : undefined}
          onClick={() => onAction({ action: 'refresh' })}
        />
        <ActionBtn label="Fetch" icon="fetch" blockedReason={info.fetchBlockedReason} onClick={() => onAction({ action: 'fetch' })} />
        <ActionBtn label="Pull" icon="pull" blockedReason={info.pullBlockedReason} onClick={() => onAction({ action: 'pull' })} />
        <ActionBtn label="Push" icon="push" blockedReason={info.pushBlockedReason} onClick={() => onAction({ action: 'push' })} />
      </div>
    </div>
  );
}

// ── GitHub ──────────────────────────────────────────────────

function GitHubControl({
  github, onOpenPullRequest, hasRemote, pullRequestBlockedReason,
}: {
  github: HeaderProps['github'];
  onOpenPullRequest: () => void;
  hasRemote: boolean;
  pullRequestBlockedReason: string | null;
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
      {/* Without an origin there is nothing to open a pull request against, so
          the slot offers the step that actually comes first (§7). */}
      <button type="button"
        onClick={onOpenPullRequest}
        disabled={hasRemote && Boolean(pullRequestBlockedReason)}
        title={hasRemote
          ? pullRequestBlockedReason
            ?? (github.username ? `Signed in as ${github.username}` : 'Create a pull request')
          : 'Publish this repository to GitHub'}
        className={`${GITHUB_BTN} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Github className="size-3.5" />
        {hasRemote ? 'Pull request' : 'Publish to GitHub'}
      </button>
    </>
  );
}

const MODE_WORD: Record<RepoModeInfo['mode'], string | null> = {
  merging: 'merging',
  detached: 'detached',
  unborn: 'no commits yet',
  normal: null,
};

const GITHUB_BTN = `flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 text-sm font-medium
  text-[var(--text-secondary)] transition-all duration-150 hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]`;

// ── Action button ───────────────────────────────────────────

function ActionBtn({
  label, icon, onClick, blockedReason, suffix, title,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  blockedReason?: string | null;
  /** A machine value shown after the label, e.g. how stale this view is. */
  suffix?: string | null;
  title?: string;
}) {
  return (
    <button type="button"
      onClick={onClick}
      disabled={Boolean(blockedReason)}
      title={blockedReason || title || label}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium rounded-md
        text-[var(--text-secondary)] border border-[var(--border-subtle)]
        hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-default)]
        disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent
        transition-all duration-150 cursor-pointer"
    >
      <ActionIcon type={icon} />
      {label}
      {suffix && <span className="font-mono text-[var(--text-muted)]">{suffix}</span>}
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

function formatRefreshTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BranchIcon({ detached }: { detached?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      className={detached ? 'text-[var(--status-warning)]' : 'text-[var(--brand-secondary)]'}
    >
      <path d="M5 3v6a3 3 0 003 3h1M11 3v4" />
      <circle cx="5" cy="3" r="1.5" />
      <circle cx="11" cy="3" r="1.5" />
      <circle cx="11" cy="9" r="1.5" />
    </svg>
  );
}
