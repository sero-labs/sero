/**
 * The history band across the foot of the Git app.
 *
 * Full width, below the work you do constantly — history is what yields space
 * when you drag the divider (§3). Its header labels the columns and doubles as
 * the collapse control, so the band can be got out of the way without dragging.
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CommitNode } from '../../../shared/types';
import { CommitGraph } from '../CommitGraph';
import { COLUMN } from '../../lib/history-columns';

interface Props {
  commits: CommitNode[];
  selectedHash?: string;
  onSelectCommit: (commit: CommitNode) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function GraphBand({
  commits, selectedHash, onSelectCommit, collapsed, onToggleCollapsed,
}: Props) {
  return (
    <div className="flex size-full min-h-0 flex-col bg-[var(--bg-base)]">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        className="flex h-6 shrink-0 items-center gap-2 pl-3 pr-4 text-left hover:bg-[var(--bg-elevated)]"
      >
        {/* The chevron leads, so expanding the band cannot shift the columns.
            The three widths and the right padding below are the same ones the
            rows use — they are what makes a label sit over its own column. */}
        {collapsed
          ? <ChevronUp className="size-3 shrink-0 text-[var(--text-muted)]" />
          : <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)]" />}
        {/* Uppercase is reserved for the panel title bar and these headers (rule 8). */}
        <ColumnLabel className="flex-1">History</ColumnLabel>
        <ColumnLabel className={`${COLUMN.hash} text-right`}>Commit</ColumnLabel>
        <ColumnLabel className={`${COLUMN.author} text-right`}>Author</ColumnLabel>
        <ColumnLabel className={`${COLUMN.when} text-right`}>When</ColumnLabel>
      </button>

      {!collapsed && (
        <div className="flex min-h-0 flex-1 flex-col">
          <CommitGraph
            commits={commits}
            selectedHash={selectedHash}
            onSelectCommit={onSelectCommit}
          />
        </div>
      )}
    </div>
  );
}

function ColumnLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-xs uppercase tracking-wider text-[var(--text-muted)] ${className}`}>
      {children}
    </span>
  );
}
