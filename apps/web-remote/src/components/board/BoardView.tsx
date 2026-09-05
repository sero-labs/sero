/**
 * Board — the landing view.
 *
 * One card per session, grouped by workspace, so a phone answers "what is
 * running, what finished, what needs me?" without opening anything.
 * Sessions that need you come first, then running ones, then the rest by
 * most recent activity.
 *
 * A pending question sits at the top and is answerable here. A question
 * names a workspace, not a session, so it belongs to the board rather
 * than to any one card.
 */

import { useCallback } from 'react';
import { LayoutGrid, Plus } from 'lucide-react';
import { EmptyState } from '@sero-ai/ui';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useWorkspaceStore } from '@/stores/workspace';
import { useChatStore } from '@/stores/chat';
import {
  activityAt,
  isUnread,
  sortBoardSessions,
  useBoardStore,
  type BoardSession,
} from '@/stores/board';
import { SessionCard } from './SessionCard';
import { ChoiceCard } from '../ChoiceCard';

export function BoardView() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace);
  const sessionStates = useWorkspaceStore((s) => s.sessionStates);
  const lastTurns = useWorkspaceStore((s) => s.lastTurns);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const createSession = useWorkspaceStore((s) => s.createSession);
  const lastViewed = useBoardStore((s) => s.lastViewed);
  const markViewed = useBoardStore((s) => s.markViewed);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const loadHistory = useChatStore((s) => s.loadHistory);

  // Opening a card is the same move as picking a session in the sidebar,
  // plus the mark that says you have now seen it.
  const openSession = useCallback(
    (workspaceId: string, sessionId: string) => {
      clearMessages();
      setActiveWorkspace(workspaceId);
      setActiveSession(sessionId);
      loadHistory(workspaceId, sessionId);
      markViewed(sessionId);
    },
    [clearMessages, setActiveWorkspace, setActiveSession, loadHistory, markViewed],
  );

  if (workspaces.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <ChoiceCard />
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={LayoutGrid}
            title="No workspaces"
            message="This token reaches no workspaces."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-3">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-1">
        <ChoiceCard />

        {workspaces.map((workspace) => {
          const sessions = sessionsByWorkspace[workspace.id] ?? [];
          const entries: BoardSession[] = sessions.map((session) => {
            const lastTurn = lastTurns[session.id];
            const activity = activityAt(session.updatedAt, lastTurn?.ts);
            return {
              session,
              state: sessionStates[session.id],
              lastTurn,
              activity,
              unread: isUnread(session.id, activity, lastViewed, session.messageCount),
            };
          });

          return (
            <section key={workspace.id} className="flex flex-col gap-2 px-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {workspace.name}
                </h2>
                <span className="text-xs text-[var(--text-muted)]">
                  {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
                </span>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={`New session in ${workspace.name}`}
                  aria-label={`New session in ${workspace.name}`}
                  onClick={() => {
                    clearMessages();
                    createSession(workspace.id);
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              {sessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border-subtle)] px-3 py-4 text-xs text-[var(--text-muted)]">
                  No sessions yet.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {sortBoardSessions(entries).map((entry) => (
                    <SessionCard
                      key={entry.session.id}
                      session={entry.session}
                      state={entry.state}
                      lastTurn={entry.lastTurn}
                      unread={entry.unread}
                      activity={entry.activity}
                      onOpen={openSession}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
