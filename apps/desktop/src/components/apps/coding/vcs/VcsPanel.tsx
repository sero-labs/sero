/**
 * VcsPanel — rich Git source control panel.
 *
 * Sections: Working Copy Status, Branches, Commit Log, Remotes.
 * Each section is a collapsible animated group.
 */

import { useEffect, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RefreshCw, Undo2, Loader2 } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import { useWorkspaceVcs, useVcsStore } from '@/stores/vcs';
import { WorkingCopySection } from './WorkingCopySection';
import { BookmarksSection } from './BookmarksSection';
import { GitHubAuthBanner } from './GitHubAuthBanner';
import { PullRequestSection } from './PullRequestSection';
import { ChangeLog } from './ChangeLog';
import { RemotesSection } from './RemotesSection';

interface VcsPanelProps {
  workspaceId: string;
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}

export function VcsPanel({ workspaceId, onOpenDiff }: VcsPanelProps) {
  const ws = useWorkspaceVcs(workspaceId);
  const refreshAll = useVcsStore((s) => s.refreshAll);
  const undo = useVcsStore((s) => s.undo);
  const [refreshing, setRefreshing] = useState(false);
  const [undoing, setUndoing] = useState(false);

  // Initial load
  useEffect(() => {
    void refreshAll(workspaceId);
  }, [workspaceId, refreshAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refreshAll(workspaceId); } finally { setRefreshing(false); }
  }, [workspaceId, refreshAll]);

  const handleUndo = useCallback(async () => {
    setUndoing(true);
    try { await undo(workspaceId); } finally { setUndoing(false); }
  }, [workspaceId, undo]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Header ────────────────────────────────────────── */}
      <div className="flex h-7 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          Source Control
        </span>
        <div className="flex items-center gap-0.5">
          <HeaderButton
            onClick={handleUndo}
            loading={undoing}
            title="Undo last operation"
          >
            <Undo2 className="size-3.5" />
          </HeaderButton>
          <HeaderButton
            onClick={handleRefresh}
            loading={refreshing}
            title="Refresh"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </HeaderButton>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────── */}
      <AnimatePresence>
        {ws?.error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="mx-2 mb-1 rounded border border-red-500/20 bg-red-500/[0.06] px-2 py-1 text-[11px] text-red-400">
              {ws.error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable sections ───────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {ws?.isLoading && !ws.logEntries.length ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : (
          <div className="space-y-0.5 pb-4">
            <WorkingCopySection
              workspaceId={workspaceId}
              status={ws?.wcStatus ?? null}
              currentChangeId={ws?.currentChangeId ?? null}
              onOpenDiff={onOpenDiff}
            />

            <BookmarksSection
              workspaceId={workspaceId}
              bookmarks={ws?.bookmarks ?? []}
              remotes={ws?.remotes ?? []}
              activePushBookmark={ws?.activePushBookmark ?? null}
            />

            <GitHubAuthBanner className="mx-2" />

            <PullRequestSection
              workspaceId={workspaceId}
              bookmarks={ws?.bookmarks ?? []}
              activePushBookmark={ws?.activePushBookmark ?? null}
            />

            <ChangeLog
              workspaceId={workspaceId}
              entries={ws?.logEntries ?? []}
              hasMore={ws?.logHasMore ?? false}
              onOpenDiff={onOpenDiff}
            />

            <RemotesSection
              workspaceId={workspaceId}
              remotes={ws?.remotes ?? []}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tiny header button ───────────────────────────────────────

function HeaderButton({
  onClick,
  loading,
  title,
  children,
}: {
  onClick: () => void;
  loading?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      className={cn(
        'flex size-6 items-center justify-center rounded-md text-[var(--text-muted)]',
        'transition-colors duration-150 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]',
        'disabled:opacity-40',
      )}
    >
      {children}
    </button>
  );
}
