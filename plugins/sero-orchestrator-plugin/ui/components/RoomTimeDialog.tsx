/**
 * "Add time to <Room>": the recovery for a Room that used all of its active time.
 *
 * It shows what was used, the limit and the unchanged spend cap, and takes one
 * number: the new TOTAL in minutes. Only a total larger than both the limit and
 * the time used can be approved, because anything less would stop the Room again
 * at once. Approving resumes the same Room with that total and sends no spend
 * change. If the Room cannot resume, the dialog stays open with the reason.
 */

import { useId, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { Input } from '@sero-ai/ui/components/ui/input';
import { formatCost, formatMinutes } from '../lib/format';
import type { ResumeOutcome } from '../lib/room-controls';
import { MINUTE_MS, minutesToExceed, type RoomTimeLimit } from '../lib/room-time';

interface RoomTimeDialogProps {
  time: RoomTimeLimit;
  /** Resumes the same Room with this new total in minutes. */
  onApprove: (totalMinutes: number) => Promise<ResumeOutcome>;
  onClose: () => void;
}

export function RoomTimeDialog({ time, onApprove, onClose }: RoomTimeDialogProps) {
  const id = useId();
  const floor = minutesToExceed(time);
  const [total, setTotal] = useState(() => String(Math.max(Math.ceil(time.limitMs / MINUTE_MS) * 2, floor + 1)));
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const value = Number(total);
  const valid = total.trim() !== '' && Number.isInteger(value) && value > floor;
  const problem = valid ? failure : `Enter a total of more than ${floor} minutes.`;

  const approve = async () => {
    if (!valid || pending) return;
    setPending(true);
    setFailure(null);
    try {
      const outcome = await onApprove(value);
      // A resumed Room closes this dialog with its hold; only a failure stays.
      if (outcome.ok) onClose();
      else setFailure(outcome.error);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent showCloseButton={false} aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add time to {time.title}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void approve();
          }}
        >
          <dl className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 rounded-lg border border-room-line bg-room-sunken px-4 py-3.5 text-sm">
            <dt className="text-room-text3">Active time used</dt>
            <dd className="text-room-text">{formatMinutes(time.usedMs)}</dd>
            <dt className="text-room-text3">Time limit</dt>
            <dd className="text-room-text">{formatMinutes(time.limitMs)}</dd>
            <dt className="text-room-text3"><label htmlFor={id}>New total (min)</label></dt>
            <dd>
              <Input
                id={id}
                type="number"
                min={floor + 1}
                step={1}
                value={total}
                disabled={pending}
                aria-invalid={!valid}
                aria-describedby={`${id}-problem`}
                onChange={(event) => setTotal(event.target.value)}
                className="h-8 w-24 font-mono"
              />
            </dd>
            <dt className="text-room-text3">Spend cap</dt>
            <dd className="text-room-text">
              {formatCost(time.maxCostUsd)}
              <small className="block text-xs text-room-text3">Not changed</small>
            </dd>
          </dl>
          <p id={`${id}-problem`} role="alert" hidden={!problem} className="text-xs text-status-error">
            {problem}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || pending}>Approve and resume</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
