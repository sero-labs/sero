/**
 * Per-session breakdown: top sessions by cost for the active period,
 * sortable, with a reveal-in-folder action per row when the host has a
 * file manager bridge.
 */

import { memo, useMemo, useState } from 'react';
import { openSeroApp } from '@sero-ai/app-runtime';
import {
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@sero-ai/ui';
import { ArrowDown, ChevronDown, ChevronRight, FolderOpen, Users } from 'lucide-react';

import { formatCost, formatCount, formatRelativeTime, formatTokens } from '../../shared/format';
import type { SessionStats } from '../../shared/types';
import { canRevealInFolder, revealInFolder } from '../lib/host';

type SortKey = 'cost' | 'tokens' | 'lastActivity';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'cost', label: 'Cost' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'lastActivity', label: 'Last active' },
];

function sortValue(session: SessionStats, key: SortKey): number {
  if (key === 'tokens') return session.tokens.total;
  return session[key];
}

function workspaceName(cwd: string): string {
  return cwd.split('/').filter(Boolean).at(-1) ?? cwd;
}

/**
 * Agent Rooms appear as ONE grouped row (spec §27.1), because a Room's members
 * must never read as unexplained ordinary chats. The group opens to the member
 * rows behind it, and a Room the path identifies also links back to the Room
 * itself — a deep link, not a read of the Orchestrator's store.
 */
export const SessionsTable = memo(function SessionsTable({ sessions }: { sessions: SessionStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const [openRooms, setOpenRooms] = useState<string[]>([]);
  const canReveal = canRevealInFolder();
  const openRoomIds = new Set(openRooms);

  const toggleRoom = (sessionId: string) => {
    setOpenRooms((current) => (
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId]
    ));
  };

  const sorted = useMemo(
    () => sessions.toSorted((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey)),
    [sessions, sortKey],
  );

  const sortHeader = (key: SortKey, label: string) => (
    <TableHead key={key} className="text-right">
      <button
        type="button"
        onClick={() => setSortKey(key)}
        className={cn('inline-flex items-center gap-0.5', sortKey === key && 'text-foreground')}
      >
        {label}
        {sortKey === key && <ArrowDown className="size-3" aria-hidden />}
      </button>
    </TableHead>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Workspace</TableHead>
              <TableHead className="text-right">Msgs</TableHead>
              {SORTS.map(({ key, label }) => (key === 'cost' || key === 'tokens' ? sortHeader(key, label) : null))}
              {sortHeader('lastActivity', 'Last active')}
              {canReveal && <TableHead className="w-8" aria-label="Actions" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.flatMap((session) => [
              <TableRow key={session.id}>
                <TableCell className="max-w-64 truncate" title={session.label}>
                  {session.room ? (
                    <RoomLabel
                      session={session}
                      open={openRoomIds.has(session.id)}
                      onToggle={() => toggleRoom(session.id)}
                    />
                  ) : (
                    session.label
                  )}
                </TableCell>
                <TableCell className="max-w-40 truncate text-muted-foreground" title={session.cwd}>
                  {workspaceName(session.cwd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(session.messages)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCost(session.cost)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatTokens(session.tokens.total)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {session.lastActivity > 0 ? formatRelativeTime(session.lastActivity) : '-'}
                </TableCell>
                {canReveal && (
                  <TableCell>
                    <IconButton
                      icon={FolderOpen}
                      label="Reveal session file in folder"
                      size="xs"
                      onClick={() => revealInFolder(session.path)}
                    />
                  </TableCell>
                )}
              </TableRow>,
              ...(openRoomIds.has(session.id)
                ? (session.room?.members ?? []).map((member) => (
                    <TableRow key={member.id} className="text-muted-foreground">
                      <TableCell className="max-w-64 truncate pl-8" title={member.label}>
                        {member.label}
                      </TableCell>
                      <TableCell className="max-w-40 truncate" title={member.cwd}>
                        {workspaceName(member.cwd)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(member.messages)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCost(member.cost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatTokens(member.tokens.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {member.lastActivity > 0 ? formatRelativeTime(member.lastActivity) : '-'}
                      </TableCell>
                      {canReveal && (
                        <TableCell>
                          <IconButton
                            icon={FolderOpen}
                            label="Reveal session file in folder"
                            size="xs"
                            onClick={() => revealInFolder(member.path)}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                : []),
            ])}
          </TableBody>
        </Table>
      </div>
      {sessions.length >= 50 && (
        <Text variant="muted" className="text-sm">
          Showing the top 50 sessions by cost for this period.
        </Text>
      )}
    </div>
  );
});

/** A Room group: expands to its members, and opens the Room when it can. */
function RoomLabel({
  session,
  open,
  onToggle,
}: {
  session: SessionStats;
  open: boolean;
  onToggle: () => void;
}) {
  const roomId = session.room?.roomId ?? null;
  const Caret = open ? ChevronDown : ChevronRight;

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <button type="button" onClick={onToggle} aria-label={open ? 'Hide members' : 'Show members'}>
        <Caret className="size-3.5 shrink-0" aria-hidden />
      </button>
      <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {roomId ? (
        <button
          type="button"
          className="min-w-0 truncate underline-offset-2 hover:underline"
          onClick={() => void openSeroApp('orchestrator', { roomId })}
          title="Open this Room"
        >
          {session.label}
        </button>
      ) : (
        <span className="min-w-0 truncate">{session.label}</span>
      )}
    </span>
  );
}
