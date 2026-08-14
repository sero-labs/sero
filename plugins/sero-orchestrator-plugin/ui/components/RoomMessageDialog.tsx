/**
 * "Message the team" — the user's word to a running Room.
 *
 * It is delivered as a SYSTEM message from outside the roster, and it always
 * wakes whoever it names: a queued intervention would arrive after the thing it
 * was meant to stop. The dialog says so plainly, because "tell the team" and
 * "interrupt the team" are different acts and the user is doing the second one.
 */

import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@sero-ai/ui';

interface Addressee {
  id: string;
  name: string;
}

interface RoomMessageDialogProps {
  open: boolean;
  busy: boolean;
  members: Addressee[];
  onSend: (body: string, memberIds: string[], now: boolean) => void;
  onClose: () => void;
}

export function RoomMessageDialog({ open, busy, members, onSend, onClose }: RoomMessageDialogProps) {
  const [body, setBody] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [now, setNow] = useState(true);

  const toggle = (memberId: string) =>
    setTargets((current) =>
      current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId],
    );

  const send = () => {
    onSend(body.trim(), targets, now);
    setBody('');
    setTargets([]);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Message the team</DialogTitle>
          <DialogDescription>
            {now
              ? 'Everyone you name picks this up straight away, ahead of whatever they were about to do.'
              : 'It waits for each member\'s next turn, so nobody is interrupted and no turn is spent on it.'}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={4}
          placeholder="Stop and check the migration first."
        />

        <div className="flex flex-wrap gap-1.5">
          {members.map((member) => (
            <Button
              key={member.id}
              size="sm"
              variant={targets.includes(member.id) ? 'secondary' : 'ghost'}
              onClick={() => toggle(member.id)}
            >
              {member.name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {targets.length === 0 ? 'Nobody named — everyone in the Room hears it.' : `${targets.length} named.`}
        </p>

        <div className="flex gap-1">
          <Button size="sm" variant={now ? 'secondary' : 'ghost'} onClick={() => setNow(true)}>Interrupt them</Button>
          <Button size="sm" variant={now ? 'ghost' : 'secondary'} onClick={() => setNow(false)}>Wait for their next turn</Button>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || body.trim().length === 0} onClick={send}>Send</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
