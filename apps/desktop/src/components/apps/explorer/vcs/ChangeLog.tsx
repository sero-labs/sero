/**
 * ChangeLog — dense, paginated change history.
 *
 * Each row: glyph · commitSha · age · description · [branches]
 * Click to expand inline detail. Context menu for actions.
 */

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useVcsStore } from '@/stores/vcs';
import type { ChangeEntry } from '@sero-ai/common';
import { VcsSection } from './VcsSection';
import { ChangeLogRow } from './ChangeLogRow';
import { ChangeDetail } from './ChangeDetail';

interface Props {
  workspaceId: string;
  entries: ChangeEntry[];
  hasMore: boolean;
  onOpenDiff?: (from: string, to: string, path?: string) => void;
}

export function ChangeLog({ workspaceId, entries, hasMore, onOpenDiff }: Props) {
  const loadMore = useVcsStore((s) => s.loadMoreLog);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleToggle = useCallback((changeId: string) => {
    setExpandedId((prev) => (prev === changeId ? null : changeId));
  }, []);

  const handleLoadMore = useCallback(async () => {
    setLoadingMore(true);
    try { await loadMore(workspaceId); } finally { setLoadingMore(false); }
  }, [workspaceId, loadMore]);

  return (
    <VcsSection title="Commits" count={entries.length} defaultOpen>
      <div className="pb-1">
        {entries.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-[var(--text-muted)]/60">
            No commits yet
          </div>
        ) : (
          entries.map((entry, i) => (
            <div key={entry.changeId}>
              <ChangeLogRow
                entry={entry}
                index={i}
                isExpanded={expandedId === entry.changeId}
                onToggle={() => handleToggle(entry.changeId)}
              />
              <AnimatePresence>
                {expandedId === entry.changeId && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="overflow-hidden"
                  >
                    <ChangeDetail
                      workspaceId={workspaceId}
                      entry={entry}
                      onOpenDiff={onOpenDiff}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}

        {/* Load more */}
        {hasMore && (
          <motion.button
            onClick={handleLoadMore}
            disabled={loadingMore}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'mx-3 mt-1 flex w-[calc(100%-1.5rem)] items-center justify-center gap-1.5',
              'rounded py-1 text-[11px] text-[var(--text-muted)]',
              'transition-colors duration-150',
              'hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-secondary)]',
              'disabled:opacity-40',
            )}
          >
            <ChevronDown className={cn('size-3', loadingMore && 'animate-bounce')} />
            {loadingMore ? 'Loading…' : 'Load more'}
          </motion.button>
        )}
      </div>
    </VcsSection>
  );
}
