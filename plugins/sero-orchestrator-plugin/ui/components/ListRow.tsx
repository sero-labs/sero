/**
 * The Home and Rooms list row, drawn to the approved proposal
 * (`1-activity-at-a-glance.html`, screens 5 and 7).
 *
 * The title takes the first line on its own. The state goes under it as a glyph
 * chip and a sentence, so what the row is doing reads without a legend. A
 * middle column carries what it waits for; money stands alone on the right in
 * mono. A row that needs the user is washed as well as bordered, but the wash
 * is never the only signal: the ask is printed in words inside it.
 *
 * Below 820px (panel container query) the three columns stack.
 */

import type { ReactNode } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

export interface ListRowProps {
  title: string;
  /** The glyph chip and the state sentence: the row's second line. */
  activity?: ReactNode;
  /** What it waits for, or who is in it. The middle column. */
  middle?: ReactNode;
  /** Mono money, right-aligned. Never shrinks. */
  money: ReactNode;
  /** Washes and borders the row amber. Something in it needs the user. */
  attention?: boolean;
  onClick: () => void;
}

export function ListRow({ title, activity, middle, money, attention = false, onClick }: ListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mb-2 grid w-full gap-x-3.5 gap-y-2 rounded-[9px] border px-3.5 py-3.25 text-left last:mb-0',
        '@min-[820px]/panel:grid-cols-[minmax(0,1fr)_300px_130px] @min-[820px]/panel:items-center',
        attention
          ? 'border-status-warning-border bg-status-warning-muted/45'
          : 'border-room-line bg-room-surface hover:border-room-line-strong',
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-room-text">{title}</span>
        {activity != null && <span className="mt-1.5 block">{activity}</span>}
      </span>
      <span className="min-w-0 text-[11px] text-room-text3">{middle}</span>
      <span className="room-tabular text-right text-[11px] whitespace-nowrap text-room-text3">{money}</span>
    </button>
  );
}
