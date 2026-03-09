/**
 * Header — app title bar with history toggle.
 *
 * Wrapped in React.memo — props are stable during streaming
 * (onToggleView is a useCallback, counts don't change mid-stream).
 */

import { memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';

interface HeaderProps {
  historyCount: number;
  isHistory: boolean;
  onToggleView: () => void;
}

export const Header = memo(function Header({ historyCount, isHistory, onToggleView }: HeaderProps) {
  return (
    <div className="vt-header flex items-center justify-between border-b border-border/50 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-400"
          >
            <path d="M12 20h9" />
            <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
          </svg>
        </div>
        <h1 className="text-sm font-semibold text-foreground">Humanizer</h1>
      </div>
      {historyCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 rounded-lg px-2.5 text-xs',
            isHistory
              ? 'text-foreground'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
          onClick={onToggleView}
        >
          {isHistory ? '← Back' : `History · ${historyCount}`}
        </Button>
      )}
    </div>
  );
});
