/**
 * PanelActions — copy, save, and refine buttons for the output pane header.
 *
 * Wrapped in React.memo — copied/saved are stable during streaming
 * (only change on user interaction, not on text deltas).
 */

import { memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@sero/ui/components/ui/tooltip';

interface PanelActionsProps {
  copied: boolean;
  saved: boolean;
  onCopy: () => void;
  onSave: () => void;
  onRefine: () => void;
}

export const PanelActions = memo(function PanelActions({
  copied,
  saved,
  onCopy,
  onSave,
  onRefine,
}: PanelActionsProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 rounded-md px-2 text-[11px] text-muted-foreground/50 hover:text-foreground"
              onClick={onRefine}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Refine
            </Button>
          </TooltipTrigger>
          <TooltipContent>Move to input for another pass</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={saved ? 'default' : 'ghost'}
              size="sm"
              disabled={saved}
              className={cn(
                'h-6 rounded-md px-2 text-[11px] transition-all duration-200',
                saved
                  ? 'bg-violet-600 text-white hover:bg-violet-600'
                  : 'text-muted-foreground/50 hover:text-foreground',
              )}
              onClick={onSave}
            >
              {saved ? (
                <span className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Saved
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{saved ? 'Saved to history' : 'Save to history'}</TooltipContent>
        </Tooltip>

        <Button
          variant={copied ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-6 rounded-md px-2.5 text-[11px] transition-all duration-200',
            copied
              ? 'bg-emerald-600 text-white hover:bg-emerald-600'
              : 'text-muted-foreground/50 hover:text-foreground',
          )}
          onClick={onCopy}
        >
          {copied ? (
            <span className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
              </svg>
              Copy
            </span>
          )}
        </Button>
      </div>
    </TooltipProvider>
  );
});
