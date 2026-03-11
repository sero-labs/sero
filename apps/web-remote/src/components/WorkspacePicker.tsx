/**
 * Workspace & session picker — sidebar panel for workspace and session selection.
 */

import { useWorkspaceStore } from '@/stores/workspace';
import { useChatStore } from '@/stores/chat';
import { cn } from '@/lib/cn';
import { FolderOpen, MessageSquarePlus, MessageSquare } from 'lucide-react';

export function WorkspacePicker() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const sessions = useWorkspaceStore((s) => s.sessions);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const createSession = useWorkspaceStore((s) => s.createSession);
  const clearMessages = useChatStore((s) => s.clearMessages);

  const handleNewSession = () => {
    clearMessages();
    createSession();
  };

  const handleSessionClick = (sessionId: string) => {
    if (sessionId !== activeSessionId) {
      clearMessages();
      setActiveSession(sessionId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Workspace selector */}
      <div className="px-3 py-2 border-b border-border">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workspace
        </label>
        <select
          value={activeWorkspaceId ?? ''}
          onChange={(e) => setActiveWorkspace(e.target.value)}
          className={cn(
            'w-full mt-1 bg-background border border-input rounded-md px-2 py-1.5',
            'text-sm text-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        >
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        {activeWorkspaceId && (
          <p className="mt-1 text-xs text-muted-foreground truncate">
            <FolderOpen className="w-3 h-3 inline mr-1" />
            {workspaces.find((w) => w.id === activeWorkspaceId)?.path}
          </p>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sessions
          </span>
          <button
            onClick={handleNewSession}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="New Session"
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        </div>

        <div className="px-2 space-y-0.5">
          {sessions.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground text-center">
              No sessions yet. Start chatting to create one.
            </p>
          )}

          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => handleSessionClick(session.id)}
              className={cn(
                'w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors',
                'flex items-center gap-2',
                session.id === activeSessionId
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
              )}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{session.name || session.id}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
