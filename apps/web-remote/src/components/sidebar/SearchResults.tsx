/**
 * Search results — a flat session list, each row tagged with its workspace.
 *
 * Two tiers feed this list. Tier 1 filters the sessions already loaded, so
 * rows appear as you type. Tier 2 is the gateway scan of message bodies,
 * which arrives later and adds the sessions tier 1 could not see.
 */

import { Loader2 } from 'lucide-react';
import { SessionRow } from './SessionRow';
import { useWorkspaceStore, type Session } from '@/stores/workspace';
import { useSessionSearchStore } from '@/stores/session-search';

interface SearchResultsProps {
  /** The trimmed, lower-case query. */
  query: string;
  onSelect: (workspaceId: string, sessionId: string) => void;
}

interface ResultRow {
  session: Session;
  workspaceName: string;
  /** Set only for a gateway match inside message text. */
  snippet?: string;
}

export function SearchResults({ query, onSelect }: SearchResultsProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const sessionStates = useWorkspaceStore((s) => s.sessionStates);
  const remoteResults = useSessionSearchStore((s) => s.results);
  const status = useSessionSearchStore((s) => s.status);

  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));

  const rows: ResultRow[] = workspaces.flatMap((workspace) =>
    (sessionsByWorkspace[workspace.id] ?? [])
      .filter((session) => {
        const haystack = `${session.name} ${session.firstMessage ?? ''}`.toLowerCase();
        return haystack.includes(query);
      })
      .map((session) => ({ session, workspaceName: workspace.name })),
  );

  // A gateway result the local filter already found is the same session.
  // Keep the local row and drop the duplicate.
  const seen = new Set(rows.map((row) => row.session.id));

  for (const result of remoteResults) {
    if (seen.has(result.sessionId)) continue;
    seen.add(result.sessionId);

    const loaded = (sessionsByWorkspace[result.workspaceId] ?? []).find(
      (session) => session.id === result.sessionId,
    );

    rows.push({
      session: loaded ?? {
        id: result.sessionId,
        name: result.name,
        workspaceId: result.workspaceId,
        updatedAt: result.updatedAt,
        messageCount: 0,
      },
      workspaceName: workspaceNames.get(result.workspaceId) ?? '',
      snippet: result.snippet,
    });
  }

  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-2 px-3 py-4 text-xs text-[var(--text-muted)]">
        {status === 'searching' && <Loader2 className="size-3.5 animate-spin" />}
        {status === 'searching' ? 'Searching every session…' : 'No sessions match.'}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1 py-1.5">
      {rows.map(({ session, workspaceName, snippet }) => (
        <SessionRow
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          state={sessionStates[session.id]}
          snippet={snippet}
          workspaceName={workspaceName}
          onSelect={(sessionId) => onSelect(session.workspaceId, sessionId)}
        />
      ))}
    </div>
  );
}
