import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { SeroSessionInfo } from '@/types/ipc';
import type { BoardArchiveEntry, WorkspaceBoardSlice } from '@/types/board';
import { useAgentBoardStore } from '@/stores/agent-board';
import { isUnclaimedIssue, loopCardKey } from './board-model';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@sero-ai/ui/components/ui/alert-dialog';
import { Button } from '@sero-ai/ui/components/ui/button';

function sourceAvailable(
  entry: BoardArchiveEntry,
  slices: Record<string, WorkspaceBoardSlice>,
  sessions: SeroSessionInfo[],
): boolean {
  if (entry.kind === 'session') {
    return sessions.some((session) => `${session.workspaceId}:session:${session.id}` === entry.key);
  }
  const slice = slices[entry.workspaceId];
  if (!slice) return false;
  if (entry.kind === 'loop') {
    return slice.index?.loops.some((loop) => loopCardKey(entry.workspaceId, loop) === entry.key
      && loop.status !== 'disabled') ?? false;
  }
  if (entry.kind === 'room') {
    return slice.rooms?.rooms.some((room) => `${entry.workspaceId}:room:${room.id}` === entry.key) ?? false;
  }
  return slice.issues.some((issue) => `${entry.workspaceId}:issue:${issue.number}` === entry.key
    && isUnclaimedIssue(issue, slice.openPrs));
}

const KIND_LABEL: Record<BoardArchiveEntry['kind'], string> = {
  loop: 'Workflow', room: 'Room', issue: 'Issue', session: 'Session',
};

export function BoardArchive({
  active, workspaceFilter, slices, sessions,
}: {
  active: boolean;
  workspaceFilter: string | null;
  slices: Record<string, WorkspaceBoardSlice>;
  sessions: SeroSessionInfo[];
}) {
  const archived = useAgentBoardStore((s) => s.archived);
  const restoreCard = useAgentBoardStore((s) => s.restoreCard);
  const deleteArchived = useAgentBoardStore((s) => s.deleteArchived);
  const [query, setQuery] = useState('');
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const target = archived.find((entry) => entry.key === deleteKey);
  const filtered = useMemo(() => archived.filter((entry) =>
    (!workspaceFilter || entry.workspaceId === workspaceFilter)
    && `${entry.title} ${entry.workspaceName} ${entry.kind}`.toLowerCase().includes(query.trim().toLowerCase()),
  ), [archived, workspaceFilter, query]);

  return <section id="archive-panel" role="tabpanel" aria-labelledby="archive-tab" hidden={!active}
    className="relative z-10 min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Archived tasks</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Restore a card, or remove it from Sero’s board. The source item stays intact.
        </p>
      </div>
      <label className="relative ml-auto">
        <span className="sr-only">Search archived tasks</span>
        <Search aria-hidden className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Search archived tasks"
          className="h-8 w-56 max-w-[60vw] rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] pl-8 pr-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]" />
      </label>
    </div>
    <div className="flex max-w-4xl flex-col gap-2">
      {filtered.map((entry) => {
        const canRestore = sourceAvailable(entry, slices, sessions);
        return <article key={entry.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5">
          <div className="min-w-48 flex-1">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">{entry.title}</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {entry.workspaceName} · {KIND_LABEL[entry.kind]} · Archived {new Date(entry.archivedAt).toLocaleDateString()}
              {!canRestore && ' · Source unavailable on the board'}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={!canRestore}
            title={canRestore ? 'Restore to the board' : 'The source is not available on the board'}
            onClick={() => restoreCard(entry.key)}>Restore</Button>
          <Button size="sm" variant="outline" className="text-status-error"
            onClick={() => setDeleteKey(entry.key)}>Delete card…</Button>
        </article>;
      })}
      {filtered.length === 0 && <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-4 py-8 text-center text-xs text-[var(--text-muted)]">
        {archived.length === 0 ? 'No archived tasks yet' : 'No archived tasks match this view'}
      </p>}
    </div>
    <AlertDialog open={deleteKey !== null} onOpenChange={(open) => { if (!open) setDeleteKey(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from Sero’s board?</AlertDialogTitle>
          <AlertDialogDescription>
            “{target?.title}” will not appear on the board again after a refresh. Its source item stays intact. This cannot be undone here.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={() => { if (deleteKey) deleteArchived(deleteKey); setDeleteKey(null); }}>
            Delete card
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
