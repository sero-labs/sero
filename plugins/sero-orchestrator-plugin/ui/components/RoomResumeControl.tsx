import { useId, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { formatElapsed } from '../lib/format';

export interface RoomResumeTime {
  usedMs: number;
  limitMs: number;
}

interface RoomResumeControlProps {
  time?: RoomResumeTime;
  busy: boolean;
  onResume(maxMinutes?: number): void;
}

/** An expired budget needs the user's new total, not another plain Resume. */
export function RoomResumeControl({ time, busy, onResume }: RoomResumeControlProps) {
  if (time && time.usedMs >= time.limitMs) {
    return <TimeExtension time={time} busy={busy} onResume={onResume} />;
  }
  return <Button size="sm" variant="outline" disabled={busy} onClick={() => onResume()}>Resume</Button>;
}

function TimeExtension({ time, busy, onResume }: RoomResumeControlProps & { time: RoomResumeTime }) {
  const id = useId();
  const minimum = Math.max(Math.ceil(time.limitMs / 60_000), Math.floor(time.usedMs / 60_000) + 1);
  const [minutes, setMinutes] = useState(() => String(Math.max(60, minimum)));
  const total = Number(minutes);
  const valid = Number.isSafeInteger(total) && total >= minimum;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !busy) onResume(total);
      }}
    >
      <p id={`${id}-hint`} className="text-xs text-room-text3">
        {formatElapsed(time.usedMs)} used. Set a total of at least {minimum} minutes. The spend cap does not change.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm text-room-text2">Total time (minutes)</label>
        <Input
          id={id}
          type="number"
          min={minimum}
          step={1}
          required
          value={minutes}
          disabled={busy}
          aria-describedby={`${id}-hint`}
          aria-invalid={!valid}
          onChange={(event) => setMinutes(event.target.value)}
          className="h-8 w-24"
        />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !valid}>Add time and resume</Button>
      </div>
    </form>
  );
}
