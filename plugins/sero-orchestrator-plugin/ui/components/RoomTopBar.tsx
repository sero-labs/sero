/**
 * The live Room's top bar (prototype screens 8 and 9).
 *
 * Two jobs: say where the Room stands against its own limits, and hold the
 * controls that belong to the user rather than to the team. The meters read
 * against the approved envelope, because "41m" means nothing without "of 2h" —
 * a limit the user set and the Room cannot exceed.
 *
 * Elapsed time is computed at render. The component re-renders when the watched
 * Room record changes, so the figure advances with the Room's own progress and
 * no timer runs.
 */

import { Button } from '@sero-ai/ui';
import { MessageSquare, Pause, Play, Square } from 'lucide-react';
import { TERMINAL_ROOM_STATUSES, type PersistedRoom } from '../../shared/room-types';
import type { RoomView } from '../lib/room-view';
import { ROOM_STATUS_STYLE } from '../lib/status-style';
import { formatCost, formatDuration } from '../lib/format';

interface RoomTopBarProps {
  room: PersistedRoom;
  view: RoomView;
  busy: boolean;
  onView: (view: RoomView) => void;
  onMessage: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function RoomTopBar({ room, view, busy, onView, onMessage, onPause, onResume, onStop }: RoomTopBarProps) {
  const { runtime, definition } = room;
  const style = ROOM_STATUS_STYLE[runtime.status];
  const elapsedMs = runtime.startedAt
    ? (runtime.endedAt ? new Date(runtime.endedAt).getTime() : Date.now()) - new Date(runtime.startedAt).getTime()
    : 0;
  const running = runtime.status === 'running';
  const paused = runtime.status === 'paused';
  const finished = TERMINAL_ROOM_STATUSES.includes(runtime.status);
  // Cancelling a Room that has already stopped changes nothing, so the control
  // that would do it is not offered.
  const live = running || paused || runtime.status === 'pausing' || runtime.status === 'completing';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-2">
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <h2 className="truncate text-base font-semibold">{definition.title}</h2>
      <span className={`rounded-full border px-2 py-0.5 text-xs ${style.badge}`}>{style.label}</span>

      <Meter
        label="Time used"
        value={formatDuration(elapsedMs)}
        of={formatDuration(definition.envelope.maxWallClockMs)}
        fraction={elapsedMs / definition.envelope.maxWallClockMs}
      />
      <Meter
        label="Spent"
        value={formatCost(runtime.usage.costUsd)}
        of={formatCost(definition.envelope.maxCostUsd)}
        fraction={runtime.usage.costUsd / definition.envelope.maxCostUsd}
      />
      <span className="text-xs text-muted-foreground">
        {runtime.activeMemberIds.length} of {definition.envelope.maxActiveTurns} turns active
      </span>

      <div className="ml-auto flex items-center gap-1">
        {finished && (
          <Button size="sm" variant={view === 'result' ? 'secondary' : 'ghost'} onClick={() => onView('result')}>
            Result
          </Button>
        )}
        <Button size="sm" variant={view === 'timeline' ? 'secondary' : 'ghost'} onClick={() => onView('timeline')}>
          Timeline
        </Button>
        <Button size="sm" variant={view === 'watch' ? 'secondary' : 'ghost'} onClick={() => onView('watch')}>
          Watch
        </Button>
        {live && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onMessage}>
            <MessageSquare className="mr-1 h-3.5 w-3.5" /> Message the team
          </Button>
        )}
        {running && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onPause}>
            <Pause className="mr-1 h-3.5 w-3.5" /> Pause
          </Button>
        )}
        {paused && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onResume}>
            <Play className="mr-1 h-3.5 w-3.5" /> Resume
          </Button>
        )}
        {live && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={onStop} className="text-destructive">
            <Square className="mr-1 h-3.5 w-3.5" /> Stop
          </Button>
        )}
      </div>
    </div>
  );
}

function Meter({ label, value, of, fraction }: { label: string; value: string; of: string; fraction: number }) {
  const pct = Math.min(100, Math.max(0, fraction * 100));
  return (
    <span
      role="progressbar"
      aria-label={`${label}: ${value} of ${of}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground"
    >
      <span className="text-foreground">{value}</span>
      <span aria-hidden className="h-1 w-12 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full ${pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      of {of}
    </span>
  );
}
