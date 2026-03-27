/**
 * SessionList — sidebar listing all sessions with metadata.
 *
 * Shows session ID (truncated), date, and workspace. Uses the
 * sessions API which returns lightweight metadata (no content parsing).
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import type { SessionFileInfo } from '../hooks/useSeroFiles';

interface SessionListProps {
  sessions: SessionFileInfo[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReload: () => void;
}

export const SessionList = memo(function SessionList({
  sessions,
  loading,
  selectedId,
  onSelect,
  onReload,
}: SessionListProps) {
  return (
    <div className="flex w-56 flex-col border-r border-border/30">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          Sessions ({sessions.length})
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-[10px] text-muted-foreground/40 hover:text-foreground"
          onClick={onReload}
        >
          ↻
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="admin-loading text-[10px] text-muted-foreground/40">Loading…</span>
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => onSelect(s.sessionId)}
              className={cn(
                'admin-sidebar-item w-full px-3 py-2 text-left transition-colors duration-150',
                'hover:bg-secondary/50',
                s.sessionId === selectedId && 'bg-emerald-500/8 border-r-2 border-emerald-400',
              )}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className={cn(
                  'font-mono text-[10px]',
                  s.sessionId === selectedId ? 'text-emerald-400' : 'text-foreground/70',
                )}>
                  {s.sessionId.slice(0, 8)}…
                </span>
                <span className="text-[9px] text-muted-foreground/30">
                  {s.messageCount} msgs
                </span>
              </div>
              {s.name && (
                <p className="mt-0.5 truncate text-[10px] text-foreground/50">
                  {s.name.length > 50 ? s.name.slice(0, 50) + '…' : s.name}
                </p>
              )}
              <p className="mt-0.5 text-[10px] text-muted-foreground/40">
                {s.dateLabel}
              </p>
            </button>
          ))}
        </ScrollArea>
      )}
    </div>
  );
});
