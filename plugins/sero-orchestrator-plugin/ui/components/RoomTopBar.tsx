/**
 * The live Room's top bar: 50px, title, status pill, divider, the two meters
 * against the approved envelope, then Timeline/Watch and the user's controls
 * with Stop danger-toned. "41m" means nothing without "of 2h" — a limit the
 * user set and the Room cannot exceed.
 *
 * The dot said what the pill beside it already said, in colour alone. The
 * turns-active count was the Team roster's member states added up, and the
 * roster names each one in words. Both are gone.
 *
 * While the Room is on hold, Message the team, Resume and Stop are not here:
 * the hold card below carries them, and each existed twice on this page.
 *
 * Elapsed time is the Room's active time, read at render. The component
 * re-renders when the watched Room record changes, so the figure advances with
 * the Room's own progress and no timer runs. It counts only the periods the
 * Room ran: a paused Room's clock holds, because a paused Room is not spending
 * its time budget and its limit does not move either.
 *
 * F3: the regions that collapse at narrow widths surface here — the Brief
 * toggle below 1200px (side panel drawer), which below 900px also carries the
 * roster as its Team tab.
 */

import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { TERMINAL_ROOM_STATUSES, type PersistedRoom, type RoomStatus } from '../../shared/room-types';
import { elapsedActiveMs } from '../../shared/room-active-time';
import { roomControls, type RoomControls } from '../lib/room-controls';
import type { RoomView } from '../lib/room-view';
import { ROOM_STATUS_STYLE } from '../lib/status-style';
import { formatCost, formatDuration, formatElapsed } from '../lib/format';
import { Meter, Pill, type PillProps } from './room-kit';
import { RoomDeleteButton } from './RoomDeleteButton';

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
  /** Whether the hold card is on screen. It carries message, resume and stop. */
  holding: boolean;
  /** What the Room can take now. Defaults to the rule with no approval open. */
  controls?: RoomControls;
  /**
   * Whether the hold is a question for the user. The pill says so, because
   * "Paused" alone does not tell a reader whether the Room is waiting on them
   * or on itself.
   */
  waitingForYou?: boolean;
  onTogglePanel: () => void;
  onBack: () => void;
  onView: (view: RoomView) => void;
  onMessage: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDelete: () => void;
}

export function RoomTopBar({
  room,
  view,
  busy,
  panelOpen,
  holding,
  controls = roomControls(room.runtime),
  waitingForYou = false,
  onTogglePanel,
  onBack,
  onView,
  onMessage,
  onPause,
  onResume,
  onStop,
  onDelete,
}: RoomTopBarProps) {
  const { runtime, definition } = room;
  const elapsedMs = runtime.startedAt ? elapsedActiveMs(runtime, Date.now()) : 0;
  const running = runtime.status === 'running';
  const finished = TERMINAL_ROOM_STATUSES.includes(runtime.status);

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
      <h2 className="min-w-[72px] truncate text-sm font-semibold tracking-[-0.02em] text-room-text">
        {definition.title}
      </h2>
      <Pill tone={waitingForYou ? 'warn' : STATUS_PILL_TONE[runtime.status]}>
        {ROOM_STATUS_STYLE[runtime.status].label}{waitingForYou ? ' · waiting for you' : ''}
      </Pill>
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
        {controls.message && !holding && (
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
        {controls.resume && !holding && (
          <Button variant="outline" className={SMALL_BTN} disabled={busy} onClick={onResume}>
            Resume
          </Button>
        )}
        {controls.stop && !holding && (
          <Button
            variant="outline"
            className={cn(SMALL_BTN, 'border-status-error-border text-status-error hover:bg-status-error-muted hover:text-status-error')}
            disabled={busy}
            onClick={onStop}
          >
            Stop
          </Button>
        )}
        {finished && <RoomDeleteButton busy={busy} onDelete={onDelete} />}
      </div>
    </div>
  );
}
