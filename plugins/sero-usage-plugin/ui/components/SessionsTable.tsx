/**
 * Per-session breakdown: top sessions by cost for the active period,
 * sortable, with a reveal-in-folder action per row when the host has a
 * file manager bridge.
 */

import { useMemo, useState } from 'react';
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
import { ArrowDown, FolderOpen } from 'lucide-react';

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

export function SessionsTable({ sessions }: { sessions: SessionStats[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('cost');
  const canReveal = canRevealInFolder();

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => sortValue(b, sortKey) - sortValue(a, sortKey)),
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
            {sorted.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="max-w-64 truncate" title={session.label}>
                  {session.label}
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {sessions.length >= 50 && (
        <Text variant="muted" className="text-[11px]">
          Showing the top 50 sessions by cost for this period.
        </Text>
      )}
    </div>
  );
}
