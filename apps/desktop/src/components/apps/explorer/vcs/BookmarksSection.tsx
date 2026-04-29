/**
 * BookmarksSection — Git branch list with remote tracking indicators.
 */

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  GitBranch,
  Plus,
  Trash2,
  ArrowUpCircle,
  Check,
  CloudDownload,
  CloudUpload,
  Loader2,
  Star,
  X,
} from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useVcsStore } from '@/stores/vcs';
import type { Bookmark, Remote } from '@sero-ai/common';
import { useTransientValue } from '../useTransientUiState';
import { VcsSection } from './VcsSection';

interface Props {
  workspaceId: string;
  bookmarks: Bookmark[];
  remotes: Remote[];
  activePushBookmark?: string | null;
}

export function BookmarksSection({
  workspaceId,
  bookmarks,
  remotes,
  activePushBookmark,
}: Props) {
  const store = useVcsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [fetching, setFetching] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [toastMsg, showToast] = useTransientValue<string>(3000);

  const hasRemotes = remotes.length > 0;

  const handleCreate = useCallback(async () => {
    const sanitized = newName.trim().replace(/\s+/g, '-');
    if (!sanitized) return;
    try {
      await store.createBookmark(workspaceId, sanitized);
      setNewName('');
      setShowCreate(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create branch');
    }
  }, [workspaceId, newName, store, showToast]);

  const handleFetch = useCallback(async () => {
    setFetching(true);
    try {
      const r = await store.fetch(workspaceId);
      showToast(r.message);
    } finally {
      setFetching(false);
    }
  }, [workspaceId, store, showToast]);

  const handlePush = useCallback(async (bm: string) => {
    setPushing(true);
    try {
      const r = await store.push(workspaceId, bm);
      showToast(r.message);
    } finally {
      setPushing(false);
    }
  }, [workspaceId, store, showToast]);

  const handleSetActive = useCallback((name: string) => {
    store.setActivePushBookmark(workspaceId, name);
    showToast(`Active push branch: ${name}`);
  }, [workspaceId, store, showToast]);

  return (
    <VcsSection
      title="Branches"
      count={bookmarks.length}
      actions={
        <div className="flex items-center gap-0.5">
          {hasRemotes && (
            <>
              <SectionAction onClick={handleFetch} loading={fetching} title="Fetch">
                <CloudDownload className="size-3" />
              </SectionAction>
              <SectionAction
                onClick={() => {
                  const target = activePushBookmark ?? bookmarks[0]?.name;
                  if (target) void handlePush(target);
                }}
                loading={pushing}
                title={activePushBookmark ? `Push (${activePushBookmark})` : 'Push'}
              >
                <CloudUpload className="size-3" />
              </SectionAction>
            </>
          )}
          <SectionAction onClick={() => setShowCreate((v) => !v)} title="Create branch">
            <Plus className="size-3" />
          </SectionAction>
        </div>
      }
    >
      <div className="pb-1.5">
        {/* Create branch inline form */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5">
                <GitBranch className="size-3 shrink-0 text-[var(--text-muted)]" />
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value.replace(/\s+/g, '-'))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreate();
                    if (e.key === 'Escape') setShowCreate(false);
                  }}
                  placeholder="feature/my-branch"
                  className={cn(
                    'h-5 flex-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)]',
                    'px-1.5 text-[11px] text-[var(--text-primary)]',
                    'outline-none focus:border-[var(--border-focus)]',
                  )}
                />
                <button
                  onClick={handleCreate}
                  className="text-[var(--status-success)] hover:brightness-125 transition-colors"
                >
                  <Check className="size-3" />
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <X className="size-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Branch list */}
        {bookmarks.length === 0 ? (
          <div className="px-3 py-1.5 text-[11px] text-[var(--text-muted)]/60">
            No branches
          </div>
        ) : (
          bookmarks.map((bm, i) => (
            <BookmarkRow
              key={bm.name}
              bookmark={bm}
              index={i}
              hasRemotes={hasRemotes}
              isActive={activePushBookmark === bm.name}
              onPush={() => void handlePush(bm.name)}
              onSetActive={() => handleSetActive(bm.name)}
              onDelete={() => void store.deleteBookmark(workspaceId, bm.name)}
            />
          ))
        )}

        {/* Toast */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mx-3 mt-1 rounded bg-[var(--bg-elevated)] px-2 py-1 text-[10px] text-[var(--text-muted)]"
            >
              {toastMsg}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </VcsSection>
  );
}

// ── Branch row ───────────────────────────────────────────────

function BookmarkRow({
  bookmark,
  index,
  hasRemotes,
  isActive,
  onPush,
  onSetActive,
  onDelete,
}: {
  bookmark: Bookmark;
  index: number;
  hasRemotes: boolean;
  isActive: boolean;
  onPush: () => void;
  onSetActive: () => void;
  onDelete: () => void;
}) {
  const synced = bookmark.remoteStatuses.every((r) => r.synced);
  const hasRemote = bookmark.remoteStatuses.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.12, delay: index * 0.025 }}
      className={cn(
        'group flex items-center gap-2 px-3 py-0.5',
        'transition-colors duration-100 hover:bg-[var(--bg-elevated)]/60',
      )}
    >
      <GitBranch className="size-3 shrink-0 text-[var(--text-muted)]" />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text-secondary)]">
        {bookmark.name}
      </span>
      {isActive && (
        <span className="rounded-sm border border-[var(--status-info-subtle)] bg-[var(--status-info-muted)] px-1 py-px text-[9px] text-[var(--status-info)]">
          active
        </span>
      )}
      <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]/50">
        {bookmark.changeId.slice(0, 8)}
      </span>

      {/* Sync indicator */}
      {hasRemote && synced && (
        <Check className="size-3 shrink-0 text-[var(--status-success)]" />
      )}
      {hasRemote && !synced && (
        <ArrowUpCircle className="size-3 shrink-0 text-[var(--status-warning)]" />
      )}
      {!hasRemote && hasRemotes && (
        <span className="text-[9px] text-[var(--text-muted)]/40">local</span>
      )}

      {/* Hover actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        {!isActive && (
          <button onClick={onSetActive} title="Set active push branch" className="text-[var(--text-muted)] hover:text-[var(--status-warning)] transition-colors">
            <Star className="size-3" />
          </button>
        )}
        {hasRemotes && !synced && (
          <button onClick={onPush} title="Push" className="text-[var(--text-muted)] hover:text-[var(--status-info)] transition-colors">
            <CloudUpload className="size-3" />
          </button>
        )}
        <button onClick={onDelete} title="Delete" className="text-[var(--text-muted)] hover:text-[var(--status-error)] transition-colors">
          <Trash2 className="size-2.5" />
        </button>
      </div>
    </motion.div>
  );
}

// ── Section action button ────────────────────────────────────

function SectionAction({
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
        'flex size-5 items-center justify-center rounded text-[var(--text-muted)]',
        'transition-colors duration-100 hover:bg-[var(--bg-muted)] hover:text-[var(--text-secondary)]',
        'disabled:opacity-40',
      )}
    >
      {loading ? <Loader2 className="size-3 animate-spin" /> : children}
    </button>
  );
}
