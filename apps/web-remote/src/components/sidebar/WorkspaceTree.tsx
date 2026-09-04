/**
 * Workspace tree — workspace rows over session rows, as the desktop
 * `WorkspaceTree` renders them.
 *
 * While a search is active the tree is replaced by a flat result list,
 * each row tagged with its workspace.
 */

import { useWorkspaceStore } from '@/stores/workspace';
import { useSessionSearchStore } from '@/stores/session-search';
import { useChatStore } from '@/stores/chat';
import { useBoardStore } from '@/stores/board';
import { WorkspaceRow } from './WorkspaceRow';
import { SessionRow } from './SessionRow';
import { SearchResults } from './SearchResults';

interface WorkspaceTreeProps {
  /** Called after a session is chosen, used on mobile to close the sheet. */
  onSessionSelect?: () => void;
}

export function WorkspaceTree({ onSessionSelect }: WorkspaceTreeProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const sessionsByWorkspace = useWorkspaceStore((s) => s.sessionsByWorkspace);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const expanded = useWorkspaceStore((s) => s.expanded);
  const sessionStates = useWorkspaceStore((s) => s.sessionStates);
  const searchQuery = useSessionSearchStore((s) => s.query);
  const toggleExpanded = useWorkspaceStore((s) => s.toggleExpanded);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const createSession = useWorkspaceStore((s) => s.createSession);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const markViewed = useBoardStore((s) => s.markViewed);

  const selectSession = (workspaceId: string, sessionId: string) => {
    if (sessionId !== activeSessionId) {
      clearMessages();
      setActiveWorkspace(workspaceId);
      setActiveSession(sessionId);
      loadHistory(workspaceId, sessionId);
    }
    // Opening a session clears its unread mark on the board.
    markViewed(sessionId);
    onSessionSelect?.();
  };

  const newSession = (workspaceId: string) => {
    clearMessages();
    createSession(workspaceId);
    onSessionSelect?.();
  };

  const query = searchQuery.trim().toLowerCase();

  if (query) {
    return (
      <SearchResults query={query} onSelect={selectSession} />
    );
  }

  if (workspaces.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
        No workspaces are in reach of this token.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {workspaces.map((workspace) => {
        const sessions = sessionsByWorkspace[workspace.id] ?? [];
        const isExpanded = expanded[workspace.id] ?? false;

        return (
          <div key={workspace.id} className="py-1.5">
            <WorkspaceRow
              name={workspace.name}
              isActive={workspace.id === activeWorkspaceId}
              expanded={isExpanded}
              onToggle={() => {
                toggleExpanded(workspace.id);
                setActiveWorkspace(workspace.id);
              }}
              onNewSession={() => newSession(workspace.id)}
            />

            {isExpanded && (
              <div className="ml-2 flex flex-col gap-1 pl-2">
                {sessions.length === 0 ? (
                  <span className="px-2 py-1 text-xs text-[var(--text-muted)]">
                    No sessions
                  </span>
                ) : (
                  sessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      state={sessionStates[session.id]}
                      onSelect={(sessionId) => selectSession(workspace.id, sessionId)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
