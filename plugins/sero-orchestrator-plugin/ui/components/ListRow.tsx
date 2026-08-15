/**
 * The Home list row (prototype screen 1 `.row`): status dot, fixed-width
 * title, truncating summary, face stack, and mono meta. Below 820px (panel
 * container query) the summary and meta drop to their own lines under the
 * title instead of truncating to nothing.
 */

import type { ReactNode } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { LoopStatus } from '../../shared/types';
import type { RoomStatus } from '../../shared/room-types';
import { Pill, StatusDot, type MemberStatus } from './room-kit';

/** Room lifecycle → the dot vocabulary the kit draws. */
export const ROOM_DOT: Record<RoomStatus, MemberStatus> = {
  running: 'working',
  pausing: 'waiting',
  paused: 'waiting',
  completing: 'working',
  ready: 'idle',
  draft: 'idle',
  completed: 'done',
  failed: 'blocked',
  cancelled: 'idle',
};

/** Loop lifecycle → the same dot vocabulary (blocked stays amber, as before). */
export const LOOP_DOT: Record<LoopStatus, MemberStatus> = {
  active: 'working',
  blocked: 'waiting',
  draft: 'idle',
  complete: 'done',
  disabled: 'idle',
};

export interface ListRowProps {
  status: MemberStatus;
  title: string;
  /** Truncating summary; full text in the hover title. */
  sub?: string;
  /** Face stack or other fixed middle content. */
  faces?: ReactNode;
  /** Amber "N needs you" pill when something waits on the user. */
  needsCount?: number;
  /** Mono meta — `5 members · 41m · $3.18 / $6.00`. Never shrinks. */
  meta: ReactNode;
  onClick: () => void;
}

export function ListRow({ status, title, sub, faces, needsCount = 0, meta, onClick }: ListRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-[7px] flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-room-line bg-room-surface px-[13px] py-[11px] text-left last:mb-0 hover:bg-room-raised/60"
    >
      <StatusDot status={status} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-room-text @min-[820px]/panel:w-[230px] @min-[820px]/panel:flex-none">
        {title}
      </span>
      {sub != null && (
        <span
          title={sub}
          className={cn(
            'order-last basis-full truncate pl-[19px] text-[11px] text-room-text3',
            '@min-[820px]/panel:order-none @min-[820px]/panel:min-w-0 @min-[820px]/panel:flex-1 @min-[820px]/panel:basis-auto @min-[820px]/panel:pl-0',
          )}
        >
          {sub}
        </span>
      )}
      {faces}
      {needsCount > 0 && (
        <Pill tone="warn" className="shrink-0">
          {needsCount} needs you
        </Pill>
      )}
      <span
        className={cn(
          'room-tabular order-last basis-full pl-[19px] text-[10px] whitespace-nowrap text-room-text3',
          '@min-[820px]/panel:order-none @min-[820px]/panel:basis-auto @min-[820px]/panel:shrink-0 @min-[820px]/panel:pl-0',
        )}
      >
        {meta}
      </span>
    </button>
  );
}
