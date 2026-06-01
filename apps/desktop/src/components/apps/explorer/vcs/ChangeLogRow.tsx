/**
 * ChangeLogRow, single dense row in the change log.
 *
 * Format: <glyph> <changeId:8> <age> <description> [bookmark-badges]
 * ~28px height. Hover reveals context actions.
 */

import { memo } from 'react';
import { CheckCircle2, Circle, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChangeEntry } from '@sero-ai/common';
import { formatAge, truncate } from './vcs-utils';

interface Props {
  entry: ChangeEntry;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function ChangeGlyph({ entry }: { entry: ChangeEntry }) {
  if (entry.isWorkingCopy) {
    return <span className="text-[11px] font-bold text-[var(--status-info)]">@</span>;
  }
  if (entry.immutable) {
    return <CheckCircle2 className="size-3 text-[var(--status-success)]" />;
  }
  if (entry.conflict) {
    return <XCircle className="size-3 text-[var(--status-error)]" />;
  }
  if (entry.empty) {
    return <Circle className="size-3 text-[var(--text-muted)]/30" />;
  }
  return <Circle className="size-3 text-[var(--text-muted)]/60" />;
}

export const ChangeLogRow = memo(function ChangeLogRow({ entry, index, isExpanded, onToggle }: Props) {
  const age = formatAge(entry.timestamp);

  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.1, delay: Math.min(index * 0.015, 0.3) }}
      onClick={onToggle}
      className={cn(
        'group flex w-full items-center gap-1.5 px-3 py-[3px] text-left',
        'transition-colors duration-75',
        'hover:bg-[var(--bg-elevated)]/60',
        isExpanded && 'bg-[var(--bg-elevated)]/40',
      )}
    >
      {/* Glyph */}
      <span className="flex w-3 shrink-0 items-center justify-center">
        <ChangeGlyph entry={entry} />
      </span>

      {/* Change ID */}
      <span
        className={cn(
          'shrink-0 font-mono text-[10px]',
          entry.isWorkingCopy
            ? 'text-[var(--status-info)]/80'
            : 'text-[var(--text-muted)]/50',
        )}
      >
        {entry.changeId.slice(0, 8)}
      </span>

      {/* Age */}
      <span className="w-6 shrink-0 text-right text-[10px] text-[var(--text-muted)]/40">
        {age}
      </span>

      {/* Description */}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[11px]',
          entry.isWorkingCopy
            ? 'text-[var(--text-primary)]'
            : entry.description === '(no description)'
              ? 'text-[var(--text-muted)]/40 italic'
              : 'text-[var(--text-secondary)]',
        )}
      >
        {truncate(entry.description, 60)}
      </span>

      {/* Bookmark badges */}
      {entry.bookmarks.length > 0 && (
        <span className="flex shrink-0 items-center gap-1">
          {entry.bookmarks.slice(0, 2).map((bm) => (
            <span
              key={bm}
              className={cn(
                'rounded-sm px-1 py-px text-[9px] font-medium leading-tight',
                'bg-[var(--status-info-muted)] text-[var(--status-info)]',
                'border border-[var(--status-info-subtle)]',
              )}
            >
              {truncate(bm, 18)}
            </span>
          ))}
          {entry.bookmarks.length > 2 && (
            <span className="text-[9px] text-[var(--text-muted)]/40">
              +{entry.bookmarks.length - 2}
            </span>
          )}
        </span>
      )}

      {/* Conflict indicator */}
      {entry.conflict && (
        <span className="shrink-0 text-[9px] font-bold text-[var(--status-error)]">CONFLICT</span>
      )}
    </motion.button>
  );
});
