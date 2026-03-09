/**
 * HistoryPanel — master-detail layout inside a card.
 *
 * Left: compact scrollable list of entries (time + short preview).
 * Right: full before/after preview of the selected entry with actions.
 * Much more usable than a wall of text or a flat list.
 */

import { useState, useCallback } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import type { HumanizeEntry } from '../../shared/types';

interface HistoryPanelProps {
  entries: HumanizeEntry[];
  onLoad: (entry: HumanizeEntry) => void;
  onClearHistory: () => void;
}

export function HistoryPanel({ entries, onLoad, onClearHistory }: HistoryPanelProps) {
  const sorted = [...entries].reverse();
  const [selectedId, setSelectedId] = useState<number | null>(
    sorted.length > 0 ? sorted[0].id : null,
  );
  const [confirmClear, setConfirmClear] = useState(false);

  const selected = sorted.find((e) => e.id === selectedId) ?? null;

  const handleClear = useCallback(() => {
    if (confirmClear) {
      onClearHistory();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear, onClearHistory]);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground/30">No humanizations yet</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Master-detail body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: entry list */}
        <ScrollArea className="w-[220px] shrink-0 border-r border-border/15">
            <div className="flex flex-col py-1">
              {sorted.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setSelectedId(entry.id)}
                  className={cn(
                    'flex flex-col gap-0.5 px-3 py-2.5 text-left',
                    'transition-colors duration-100',
                    entry.id === selectedId
                      ? 'bg-emerald-500/10'
                      : 'hover:bg-background/30',
                  )}
                >
                  <span
                    className={cn(
                      'text-[10px]',
                      entry.id === selectedId
                        ? 'text-emerald-400/70'
                        : 'text-muted-foreground/35',
                    )}
                  >
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[12px] leading-snug',
                      entry.id === selectedId
                        ? 'text-foreground/90'
                        : 'text-foreground/50',
                    )}
                  >
                    {firstLine(entry.inputText)}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>

          {/* Right: detail preview */}
          {selected ? (
            <DetailPane entry={selected} onLoad={onLoad} />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-xs text-muted-foreground/30">Select an entry</p>
            </div>
          )}
        </div>

      {/* Footer */}
      <div className="flex items-center justify-center border-t border-border/10 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className={cn(
            'h-7 rounded-lg px-3 text-[11px] transition-all duration-200',
            confirmClear
              ? 'text-red-400 hover:bg-red-500/10 hover:text-red-400'
              : 'text-muted-foreground/25 hover:text-muted-foreground/50',
          )}
        >
          {confirmClear ? 'Click again to confirm' : 'Clear history'}
        </Button>
      </div>
    </div>
  );
}

// ── Detail pane ────────────────────────────────────────────

function DetailPane({
  entry,
  onLoad,
}: {
  entry: HumanizeEntry;
  onLoad: (entry: HumanizeEntry) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Instruction badge + load button */}
      <div className="flex items-center justify-between border-b border-border/10 px-4 py-2">
        <div className="flex items-center gap-2">
          {entry.instructions ? (
            <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400/70">
              {entry.instructions}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground/30">No instructions</span>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => onLoad(entry)}
          className="h-7 rounded-lg bg-emerald-600 px-3 text-[11px] text-white hover:bg-emerald-500"
        >
          Load in editor
        </Button>
      </div>

      {/* Before / After split */}
      <div className="flex min-h-0 flex-1">
        {/* Original */}
        <div className="flex min-h-0 flex-1 flex-col border-r border-border/10">
          <div className="px-4 py-1.5">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/35">
              Original
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <p className="px-4 pb-4 text-[12.5px] leading-[1.7] text-foreground/55">
              {entry.inputText}
            </p>
          </ScrollArea>
        </div>

        {/* Humanized */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 py-1.5">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-emerald-400/60">
              Humanized
            </span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <p className="px-4 pb-4 text-[12.5px] leading-[1.7] text-foreground/80">
              {entry.outputText}
            </p>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────

/** Extract first sentence or first ~60 chars as a short label. */
function firstLine(text: string): string {
  const first = text.split(/[.!?\n]/)[0]?.trim() ?? text.trim();
  if (first.length <= 60) return first;
  return first.slice(0, 57) + '…';
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString();
}
