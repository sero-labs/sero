import { useCallback, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  GitBranch,
  Loader2,
} from 'lucide-react';

import { GitShipActionPill } from './GitShipActionPill';
import { GitPullRequestComposer } from './GitPullRequestComposer';
import { GitRemotePublishSection } from './GitRemotePublishSection';
import type { GitTitleBarState } from './git-titlebar-state';
import { formatGitRefreshTime } from './git-titlebar-state';

interface GitShipPanelProps {
  workspaceId: string;
  workspaceName: string;
  gitState: GitTitleBarState;
  stagedCount: number;
  changedCount: number;
  aheadCount: number;
  behindCount: number;
  isCurrentWorkspace: boolean;
}

interface ActionFeedback {
  tone: 'success' | 'error';
  message: string;
}

export function GitShipPanel({
  workspaceId,
  workspaceName,
  gitState,
  stagedCount,
  changedCount,
  aheadCount,
  behindCount,
  isCurrentWorkspace,
}: GitShipPanelProps) {
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const currentBranch = useMemo(() => gitState.branches.find((branch) => branch.current), [gitState.branches]);
  const branchLabel = gitState.currentBranch || currentBranch?.name || 'detached';
  const hasRemote = gitState.remotes.length > 0;
  const canCommitStaged = stagedCount > 0;
  const canCommitAll = changedCount > 0;

  const heroText = useMemo(() => {
    if (!isCurrentWorkspace) return 'Switching workspaces…';
    if (gitState.error) return gitState.error;
    if (!hasRemote) return 'This repo is local-only. Publish it to GitHub or connect an origin to unlock push and PR actions.';
    if (stagedCount > 0 || changedCount > 0) return 'Wrap up the current changes and keep the branch moving.';
    if (aheadCount > 0) return 'Branch is ahead — publish it and open the review lane.';
    if (behindCount > 0) return 'Branch is behind — pull before you stack more work on top.';
    return 'Working tree is clean. Draft the next PR whenever you are ready.';
  }, [aheadCount, behindCount, changedCount, gitState.error, hasRemote, isCurrentWorkspace, stagedCount]);

  const bumpRefresh = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  const refreshGitMetadata = useCallback(async () => {
    const result = await window.sero.gitApp.run(workspaceId, { action: 'refresh' });
    if (!result.ok) throw new Error(result.message);
    bumpRefresh();
  }, [bumpRefresh, workspaceId]);

  const runGitAction = useCallback(async (
    gitAction: 'commit' | 'fetch' | 'pull' | 'push',
    extra: { all?: boolean; message?: string } = {},
  ) => {
    setAction(gitAction);
    setFeedback(null);
    try {
      const result = await window.sero.gitApp.run(workspaceId, {
        action: gitAction,
        all: extra.all,
        message: extra.message,
      });
      setFeedback({
        tone: result.ok ? 'success' : 'error',
        message: result.message,
      });
      if (!result.ok) return;
      if (gitAction === 'commit') setMessage('');
      bumpRefresh();
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : `Failed to ${gitAction}`,
      });
    } finally {
      setAction(null);
    }
  }, [bumpRefresh, workspaceId]);

  const handleCommit = useCallback(async (mode: 'staged' | 'all') => {
    const nextMessage = message.trim();
    if (!nextMessage) {
      setFeedback({ tone: 'error', message: 'Commit message required.' });
      return;
    }
    await runGitAction('commit', {
      all: mode === 'all',
      message: nextMessage,
    });
  }, [message, runGitAction]);

  const handlePublished = useCallback(async () => {
    await refreshGitMetadata();
  }, [refreshGitMetadata]);

  return (
    <div className="w-[420px] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] shadow-2xl shadow-black/25">
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--text-muted)]">
          Ship deck
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <GitBranch className="size-4 text-[var(--accent-primary)]" />
          <span className="truncate">{gitState.repoName || workspaceName}</span>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
            {branchLabel}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{heroText}</p>
        <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
          <span>{formatGitRefreshTime(gitState.lastRefresh)}</span>
          <span>•</span>
          <span>{stagedCount} staged</span>
          <span>•</span>
          <span>{changedCount} changed</span>
          <span>•</span>
          <span>{aheadCount}↑ / {behindCount}↓</span>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
              Quick sync
            </h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {gitState.syncMode === 'poll' ? 'Polling fallback' : 'Watcher active'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GitShipActionPill
              label="Fetch"
              icon={<ArrowDownRight className="size-3.5" />}
              onClick={() => void runGitAction('fetch')}
              busy={action === 'fetch'}
              disabled={!hasRemote}
            />
            <GitShipActionPill
              label={behindCount > 0 ? `Pull ${behindCount}` : 'Pull'}
              icon={<ArrowDownRight className="size-3.5" />}
              onClick={() => void runGitAction('pull')}
              busy={action === 'pull'}
              disabled={!hasRemote}
            />
            <GitShipActionPill
              label={aheadCount > 0 ? `Push ${aheadCount}` : 'Push'}
              icon={<ArrowUpRight className="size-3.5" />}
              onClick={() => void runGitAction('push')}
              busy={action === 'push'}
              disabled={!hasRemote}
              emphasis={aheadCount > 0 || !hasRemote}
            />
          </div>
        </div>

        <section className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">Commit</h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {canCommitStaged || canCommitAll ? 'Ready' : 'Clean'}
            </span>
          </div>

          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                void handleCommit(canCommitStaged ? 'staged' : 'all');
              }
            }}
            placeholder="feat: describe the change you are shipping"
            className="h-9 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[12px] text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-focus)]"
          />

          <div className="flex items-center gap-2">
            <Button
              onClick={() => void handleCommit(canCommitStaged ? 'staged' : 'all')}
              disabled={action === 'commit' || (!canCommitStaged && !canCommitAll)}
              className="h-8 rounded-lg bg-[var(--accent-primary)] px-3 text-[11px] font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
            >
              {action === 'commit' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Check className="mr-1 size-3.5" />}
              {canCommitStaged ? `Commit ${stagedCount} staged` : 'Stage all + commit'}
            </Button>
            {canCommitStaged && canCommitAll && (
              <Button
                variant="ghost"
                onClick={() => void handleCommit('all')}
                disabled={action === 'commit'}
                className="h-8 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
              >
                All in
              </Button>
            )}
          </div>
        </section>

        {!hasRemote && (
          <GitRemotePublishSection
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            onPublished={handlePublished}
          />
        )}

        <GitPullRequestComposer
          workspaceId={workspaceId}
          branchLabel={branchLabel}
          hasRemote={hasRemote}
          refreshToken={refreshToken}
        />

        {feedback && (
          <div className={cn(
            'rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
            feedback.tone === 'success'
              ? 'border-[var(--status-success-border)] bg-[var(--status-success-faint)] text-[var(--status-success)]'
              : 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]',
          )}>
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}
