import { useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';
import { ChevronDown, Sparkles } from 'lucide-react';

import { useAppStore } from '@/stores/app';
import { useActiveWorkspace } from '@/stores/workspace';
import { GitShipPanel } from './GitShipPanel';
import {
  EMPTY_GIT_TITLE_STATE,
  formatGitRefreshTime,
  getGitStateFilePath,
  normalizeGitTitleState,
} from './git-titlebar-state';

export function GitTitleBarControls() {
  const activeApp = useAppStore((state) => state.activeApp);
  const workspace = useActiveWorkspace();
  const [open, setOpen] = useState(false);
  const [gitState, setGitState] = useState(EMPTY_GIT_TITLE_STATE);

  const shouldRender = activeApp === 'git' && Boolean(workspace?.path);
  const stateFilePath = shouldRender && workspace ? getGitStateFilePath(workspace.path) : null;

  useEffect(() => {
    if (!shouldRender || !workspace || !stateFilePath) {
      setOpen(false);
      setGitState(EMPTY_GIT_TITLE_STATE);
      return;
    }

    let active = true;
    setGitState({
      ...EMPTY_GIT_TITLE_STATE,
      repoPath: workspace.path,
      loading: true,
    });

    const unsubscribe = window.sero.appState.onChange((filePath: string, data: unknown) => {
      if (!active || filePath !== stateFilePath || data == null) return;
      setGitState(normalizeGitTitleState(data, workspace.path));
    });

    void window.sero.appState.watch(stateFilePath).then((current: unknown) => {
      if (!active || current == null) return;
      setGitState(normalizeGitTitleState(current, workspace.path));
    });

    return () => {
      active = false;
      unsubscribe();
      void window.sero.appState.unwatch(stateFilePath);
    };
  }, [shouldRender, stateFilePath, workspace]);

  useEffect(() => {
    setOpen(false);
  }, [workspace?.id]);

  const currentBranch = useMemo(
    () => gitState.branches.find((branch) => branch.current),
    [gitState.branches],
  );
  const stagedCount = useMemo(
    () => gitState.fileChanges.filter((file) => file.staged).length,
    [gitState.fileChanges],
  );
  const changedCount = useMemo(
    () => gitState.fileChanges.filter((file) => !file.staged).length,
    [gitState.fileChanges],
  );
  const aheadCount = currentBranch?.ahead ?? 0;
  const behindCount = currentBranch?.behind ?? 0;
  const isCurrentWorkspace = workspace ? gitState.repoPath === workspace.path : false;
  const disabled = !workspace || !isCurrentWorkspace || gitState.error === 'Not a git repository';

  if (!shouldRender || !workspace) {
    return null;
  }

  const hasRemote = gitState.remotes.length > 0;
  const statusSummary = getStatusSummary({
    loading: gitState.loading,
    error: gitState.error,
    isCurrentWorkspace,
    stagedCount,
    changedCount,
    aheadCount,
    behindCount,
    hasRemote,
  });
  const statusTone = getStatusTone({
    loading: gitState.loading,
    error: gitState.error,
    isCurrentWorkspace,
    stagedCount,
    changedCount,
    aheadCount,
    behindCount,
    hasRemote,
  });
  const shipLabel = getShipLabel({
    stagedCount,
    changedCount,
    aheadCount,
    hasRemote,
    disabled,
  });
  const buttonTitle = getButtonTitle({
    disabled,
    error: gitState.error,
    refreshedAt: gitState.lastRefresh,
    syncMode: gitState.syncMode,
  });

  return (
    <div className="flex items-center gap-2.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className={cn(
              'inline-flex h-7 items-center gap-2.5 rounded-lg border px-3.5 text-[11px] font-semibold transition-colors',
              'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)]',
              'hover:bg-[var(--bg-overlay)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            title={buttonTitle}
          >
            <Sparkles className="size-3.5 text-[var(--accent-primary)]" />
            <span>{shipLabel}</span>
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[10px] font-medium tracking-normal',
                statusTone,
              )}
            >
              {statusSummary}
            </span>
            <ChevronDown className="size-3.5 text-[var(--text-muted)]" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" sideOffset={10} className="w-auto border-none bg-transparent p-0 shadow-none">
          <GitShipPanel
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            gitState={gitState}
            stagedCount={stagedCount}
            changedCount={changedCount}
            aheadCount={aheadCount}
            behindCount={behindCount}
            isCurrentWorkspace={isCurrentWorkspace}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function getStatusSummary({
  loading,
  error,
  isCurrentWorkspace,
  stagedCount,
  changedCount,
  aheadCount,
  behindCount,
  hasRemote,
}: {
  loading: boolean;
  error?: string;
  isCurrentWorkspace: boolean;
  stagedCount: number;
  changedCount: number;
  aheadCount: number;
  behindCount: number;
  hasRemote: boolean;
}): string {
  if (!isCurrentWorkspace || loading) return 'Syncing…';
  if (error) return 'Issue';
  if (!hasRemote) return 'No origin';
  if (stagedCount > 0) return `${stagedCount} staged`;
  if (changedCount > 0) return `${changedCount} changed`;
  if (aheadCount > 0 || behindCount > 0) return `${aheadCount}↑ · ${behindCount}↓`;
  return 'Clean';
}

function getStatusTone({
  loading,
  error,
  isCurrentWorkspace,
  stagedCount,
  changedCount,
  aheadCount,
  behindCount,
  hasRemote,
}: {
  loading: boolean;
  error?: string;
  isCurrentWorkspace: boolean;
  stagedCount: number;
  changedCount: number;
  aheadCount: number;
  behindCount: number;
  hasRemote: boolean;
}): string {
  if (!isCurrentWorkspace || loading) {
    return 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 text-[var(--text-muted)]';
  }
  if (error) {
    return 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]';
  }
  if (!hasRemote) {
    return 'border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] text-[var(--status-warning)]';
  }
  if (stagedCount > 0 || changedCount > 0) {
    return 'border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] text-[var(--text-secondary)]';
  }
  if (aheadCount > 0 || behindCount > 0) {
    return 'border-[var(--status-info-border)] bg-[var(--status-info-faint)] text-[var(--text-secondary)]';
  }
  return 'border-[var(--border-subtle)] bg-[var(--bg-muted)]/50 text-[var(--text-muted)]';
}

function getShipLabel({
  stagedCount,
  changedCount,
  aheadCount,
  hasRemote,
  disabled,
}: {
  stagedCount: number;
  changedCount: number;
  aheadCount: number;
  hasRemote: boolean;
  disabled: boolean;
}): string {
  if (disabled) return 'Ship';
  if (!hasRemote) return 'Publish';
  if (stagedCount > 0) return `Commit ${stagedCount}`;
  if (changedCount > 0) return `Ship ${changedCount}`;
  if (aheadCount > 0) return 'Create PR';
  return 'Ship';
}

function getButtonTitle({
  disabled,
  error,
  refreshedAt,
  syncMode,
}: {
  disabled: boolean;
  error?: string;
  refreshedAt: string;
  syncMode: 'manual' | 'watch' | 'poll';
}): string {
  if (disabled) return 'Git actions are unavailable for this workspace.';
  if (error) return error;
  const mode = syncMode === 'poll' ? 'Polling fallback enabled' : 'Watching repository changes';
  const refreshed = refreshedAt ? `Last update: ${formatGitRefreshTime(refreshedAt)}` : 'Waiting for Git state';
  return `${mode}. ${refreshed}`;
}
