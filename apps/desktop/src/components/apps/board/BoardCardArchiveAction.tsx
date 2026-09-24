import { useState } from 'react';
import { Archive, MoreHorizontal } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@sero-ai/ui/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@sero-ai/ui/components/ui/dropdown-menu';
import { useAgentBoardStore } from '@/stores/agent-board';
import type { BoardCard } from './board-model';

function mayContinue(card: BoardCard): boolean {
  if (card.kind === 'session') return card.streaming;
  if (card.kind === 'loop') return card.loop.status === 'active' || Boolean(card.loop.progress?.running);
  if (card.kind === 'room') return card.room.status === 'running' || card.room.activeMemberCount > 0;
  return false;
}

export function BoardCardArchiveAction({ card, onOpen }: { card: BoardCard; onOpen: () => void }) {
  const archiveCard = useAgentBoardStore((s) => s.archiveCard);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeWork = mayContinue(card);

  async function stopSession(): Promise<void> {
    if (card.kind !== 'session' || stopping) return;
    setStopping(true);
    setError(null);
    try {
      await window.sero.agent.abort(card.sessionId);
      archiveCard(card);
      setConfirmOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stop the session.');
    } finally {
      setStopping(false);
    }
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${card.kind === 'session' ? card.title : card.kind === 'issue' ? card.issue.title : card.kind === 'loop' ? card.loop.title : card.room.title}`}
          className="flex size-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text-primary)]">
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => activeWork ? setConfirmOpen(true) : archiveCard(card)}>
          <Archive className="size-3.5" /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={confirmOpen} onOpenChange={(open) => {
      if (stopping && !open) return;
      setConfirmOpen(open);
      if (!open) setError(null);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive active work?</AlertDialogTitle>
          <AlertDialogDescription>
            This card will leave the board. Archiving alone does not stop the work. You can restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-sm text-status-error">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={stopping}>Cancel</AlertDialogCancel>
          {card.kind === 'session' ? <Button variant="outline" disabled={stopping} onClick={() => void stopSession()}>
            {stopping ? 'Stopping…' : 'Stop & archive'}
          </Button> : <Button variant="outline" onClick={() => { setConfirmOpen(false); onOpen(); }}>
            Open task
          </Button>}
          <Button disabled={stopping} onClick={() => { archiveCard(card); setConfirmOpen(false); }}>
            Archive anyway
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
