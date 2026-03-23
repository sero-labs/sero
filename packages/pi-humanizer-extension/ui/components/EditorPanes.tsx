/**
 * EditorPanes — shared pane header, footer, and loading spinner
 * used by the side-by-side and full-width editor layouts.
 *
 * PaneHeader and PaneFooter are memoized. During streaming, the output
 * footer is hidden (stats are meaningless mid-stream), so PaneFooter
 * only rerenders on the input side (where text is stable).
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { StatsRow } from './StatsRow';

// ── Pane header ────────────────────────────────────────────

interface PaneHeaderProps {
  label: string;
  variant: 'muted' | 'accent';
  children?: React.ReactNode;
}

export const PaneHeader = memo(function PaneHeader({ label, variant, children }: PaneHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 px-4 py-1.5">
      <span
        className={cn(
          'text-[11px] font-semibold tracking-wider uppercase',
          variant === 'accent'
            ? 'text-emerald-400'
            : 'text-muted-foreground/40',
        )}
      >
        {label}
      </span>
      {children}
    </div>
  );
});

// ── Pane footer ────────────────────────────────────────────

export const PaneFooter = memo(function PaneFooter({ text }: { text: string }) {
  return (
    <div className="border-t border-border/30 px-4 py-1.5">
      <StatsRow text={text} />
    </div>
  );
});

// ── Loading spinner ────────────────────────────────────────

export function LoadingSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        className="opacity-20"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
