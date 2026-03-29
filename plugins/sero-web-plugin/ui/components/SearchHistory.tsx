// components/SearchHistory.tsx — Scrollable list of past searches/fetches
// with a clear-all button.

import { useCallback } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Trash2 } from 'lucide-react';
import type { WebAccessState, WebEntry } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { SearchEntry } from './SearchEntry';

interface SearchHistoryProps {
  entries: WebEntry[];
}

export function SearchHistory({ entries }: SearchHistoryProps) {
  const [, updateState] = useAppState<WebAccessState>(DEFAULT_STATE);

  const clearAll = useCallback(() => {
    const clearedAt = Date.now();
    updateState((prev) => ({
      ...prev,
      entries: [],
      historyClearedAt: clearedAt,
      lastSyncedAt: clearedAt,
    }));
  }, [updateState]);

  if (entries.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">No searches yet</p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Ask the agent to search the web
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Clear button */}
      <div className="flex shrink-0 items-center justify-end border-b border-border/50 px-3 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-destructive"
          onClick={clearAll}
        >
          <Trash2 className="h-3 w-3" />
          Clear history
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {entries.map((entry) => (
            <SearchEntry key={entry.id} entry={entry} />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default SearchHistory;
