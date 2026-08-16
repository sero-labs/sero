/**
 * The live Room's top bar (prototype screens 8 and 9): 50px, dot, title,
 * status pill, divider, the two meters against the approved envelope, the
 * turn count, then Timeline/Watch and the user's controls with Stop danger-
 * toned. "41m" means nothing without "of 2h" — a limit the user set and the
 * Room cannot exceed.
 *
 * Elapsed time is computed at render. The component re-renders when the watched
 * Room record changes, so the figure advances with the Room's own progress and
 * no timer runs.
 *
 * F3: the regions that collapse at narrow widths surface here — the Brief
 * toggle below 1200px (side panel drawer), which below 900px also carries the
 * roster as its Team tab.
 */

import { Button } from '@sero-ai/ui';
import { cn } from '@sero-ai/ui/lib/utils';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { TERMINAL_ROOM_STATUSES, type PersistedRoom, type RoomStatus } from '../../shared/room-types';
import type { RoomView } from '../lib/room-view';
import { ROOM_STATUS_STYLE } from '../lib/status-style';
import { formatCost, formatDuration, formatElapsed } from '../lib/format';
import { ROOM_DOT } from './ListRow';
import { Meter, Pill, StatusDot, type PillProps } from './room-kit';

/** Room lifecycle → the pill's accent (prototype `.pill em` while running). */
const STATUS_PILL_TONE: Record<RoomStatus, PillProps['tone']> = {
  adjusting: 'neutral',
  starting: 'brand',
  running: 'brand',
  completing: 'brand',
  pausing: 'warn',
  paused: 'warn',
  ready: 'neutral',
  draft: 'neutral',
  completed: 'info',
  failed: 'error',
  cancelled: 'neutral',
};

/** The prototype's small .btn (26px, 11px type). */
const SMALL_BTN = 'h-[26px] px-2.5 text-[11px]';

interface RoomTopBarProps {
  room: PersistedRoom;
  view: RoomView;
  busy: boolean;
  /** The side-panel drawer state below 1200px (F3). */
  panelOpen: boolean;
  onTogglePanel: () => void;
  onBack: () => void;
  onView: (view: RoomView) => void;
  onMessage: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function RoomTopBar({
  room,
  view,
  busy,
  panelOpen,
  onTogglePanel,
  onBack,
  onView,
  onMessage,
  onPause,
  onResume,
  onStop,
}: RoomTopBarProps) {
  const { runtime, definition } = room;
  const elapsedMs = runtime.startedAt
    ? (runtime.endedAt ? new Date(runtime.endedAt).getTime() : Date.now()) - new Date(runtime.startedAt).getTime()
    : 0;
  const running = runtime.status === 'running';
  const paused = runtime.status === 'paused';
  const finished = TERMINAL_ROOM_STATUSES.includes(runtime.status);
  // Cancelling a Room that has already stopped changes nothing, so the control
  // that would do it is not offered.
  const live = running || paused || runtime.status === 'pausing' || runtime.status === 'completing';

  const views: Array<{ id: RoomView; label: string }> = [
    ...(finished ? [{ id: 'result' as const, label: 'Result' }] : []),
    { id: 'timeline', label: 'Timeline' },
    { id: 'watch', label: 'Watch' },
  ];

  return (
    <div className="flex h-[50px] min-w-0 shrink-0 items-center gap-3.5 overflow-hidden border-b border-room-line px-[18px]">
      <Button variant="ghost" size="icon" aria-label="Back to Rooms" className="-ml-2 size-[26px] shrink-0 text-room-text3" onClick={onBack}>
        <ArrowLeft className="size-3.5" />
      </Button>
      <StatusDot status={ROOM_DOT[runtime.status]} />
      <h2 className="min-w-[72px] truncate text-sm font-semibold tracking-[-0.02em] text-room-text">
        {definition.title}
      </h2>
      <Pill tone={STATUS_PILL_TONE[runtime.status]}>{ROOM_STATUS_STYLE[runtime.status].label}</Pill>
      <span aria-hidden className="h-[18px] w-px shrink-0 bg-room-line @max-[820px]/panel:hidden" />

      <Meter
        value={<span aria-label={`Time used: ${formatElapsed(elapsedMs)}`}>{formatElapsed(elapsedMs)}</span>}
        of={formatDuration(definition.envelope.maxWallClockMs)}
        pct={(elapsedMs / definition.envelope.maxWallClockMs) * 100}
        className="@max-[820px]/panel:hidden"
      />
      <Meter
        value={<span aria-label={`Spent: ${formatCost(runtime.usage.costUsd)}`}>{formatCost(runtime.usage.costUsd)}</span>}
        of={formatCost(definition.envelope.maxCostUsd)}
        pct={(runtime.usage.costUsd / definition.envelope.maxCostUsd) * 100}
        className="@max-[820px]/panel:hidden"
      />
      <span className="room-tabular shrink-0 text-[10px] text-room-text3 @max-[1000px]/panel:hidden">
        {runtime.activeMemberIds.length} of {definition.envelope.maxActiveTurns} turns active
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-[7px]">
        <div role="group" aria-label="Room view" className="flex gap-[5px]">
          {views.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={view === option.id}
              onClick={() => onView(option.id)}
              className={cn(
                'flex h-[21px] items-center rounded-[11px] px-2 text-[10px]',
                view === option.id
                  ? 'bg-brand-primary-subtle text-room-ink-brand'
                  : 'bg-room-muted text-room-text3 hover:text-room-text2',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        {/* F3: what collapsed gains its control here, in the same commit. */}
        <Button
          variant="outline"
          aria-pressed={panelOpen}
          className={cn(SMALL_BTN, 'hidden @max-[1200px]/panel:inline-flex')}
          onClick={onTogglePanel}
        >
          Brief
        </Button>
        {live && (
          <Button variant="outline" aria-label="Message the team" className={SMALL_BTN} disabled={busy} onClick={onMessage}>
            <MessageSquare className="size-3 @min-[1000px]/panel:hidden" />
            <span className="@max-[1000px]/panel:hidden">Message the team</span>
          </Button>
        )}
        {running && (
          <Button variant="outline" className={SMALL_BTN} disabled={busy} onClick={onPause}>
            Pause
          </Button>
        )}
        {paused && (
          <Button variant="outline" className={SMALL_BTN} disabled={busy} onClick={onResume}>
            Resume
          </Button>
        )}
        {live && (
          <Button
            variant="outline"
            className={cn(SMALL_BTN, 'border-status-error-border text-status-error hover:bg-status-error-muted hover:text-status-error')}
            disabled={busy}
            onClick={onStop}
          >
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}
