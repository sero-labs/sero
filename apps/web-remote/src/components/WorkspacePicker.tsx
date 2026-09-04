/**
 * Workspace & session picker, sidebar panel for workspace and session selection.
 * Uses @sero-ai/ui Select and Button components.
 */

import { useWorkspaceStore } from '@/stores/workspace';
import { useChatStore } from '@/stores/chat';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui/components/ui/select';
import { FolderOpen, Loader2, MessageSquarePlus, MessageSquare } from 'lucide-react';
import type { SessionState } from '@/lib/gateway-client';

interface WorkspacePickerProps {
  /** Called after a session is selected, used on mobile to close the sidebar sheet. */
  onSessionSelect?: () => void;
}

export function WorkspacePicker({ onSessionSelect }: WorkspacePickerProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const sessions = useWorkspaceStore((s) => s.sessions);
  const activeSessionId = useWorkspaceStore((s) => s.activeSessionId);
  const sessionStates = useWorkspaceStore((s) => s.sessionStates);
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace);
  const setActiveSession = useWorkspaceStore((s) => s.setActiveSession);
  const createSession = useWorkspaceStore((s) => s.createSession);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const loadHistory = useChatStore((s) => s.loadHistory);

  const handleNewSession = () => {
    clearMessages();
    createSession();
    onSessionSelect?.();
  };

  const handleSessionClick = (sessionId: string) => {
    if (sessionId !== activeSessionId) {
      clearMessages();
      setActiveSession(sessionId);
      if (activeWorkspaceId) {
        loadHistory(activeWorkspaceId, sessionId);
      }
    }
    onSessionSelect?.();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Workspace selector */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Workspace
        </div>
        <Select
          value={activeWorkspaceId ?? ''}
          onValueChange={setActiveWorkspace}
        >
          <SelectTrigger className="w-full mt-1 h-8 text-base">
            <SelectValue placeholder="Select workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((ws) => (
              <SelectItem key={ws.id} value={ws.id}>
                {ws.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeWorkspaceId && (
          <p className="mt-1 text-xs text-muted-foreground truncate">
            <FolderOpen className="size-3 inline mr-1" />
            {workspaces.find((w) => w.id === activeWorkspaceId)?.path}
          </p>
        )}
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Sessions
          </span>
          <Button
            onClick={handleNewSession}
            variant="ghost"
            size="icon-xs"
            title="New Session"
          >
            <MessageSquarePlus className="size-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 space-y-0.5 pb-2">
            {sessions.length === 0 && (
              <p className="px-2 py-4 text-xs text-muted-foreground text-center">
                No sessions yet. Start chatting to create one.
              </p>
            )}

            {sessions.map((session) => (
              <button type="button"
                key={session.id}
                onClick={() => handleSessionClick(session.id)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md text-base transition-colors',
                  'flex items-center gap-2',
                  session.id === activeSessionId
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <SessionStateIcon state={sessionStates[session.id]} />
                <span className="truncate">
                  {session.name || session.firstMessage || session.id}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

/**
 * Live session state, from the `session_state` push event. Running spins,
 * awaiting input pulses in the warning token, idle is a plain icon.
 */
function SessionStateIcon({ state }: { state?: SessionState }) {
  if (state === 'running') {
    return (
      <Loader2
        className="size-3.5 shrink-0 animate-spin text-status-info"
        aria-label="Running"
      />
    );
  }

  if (state === 'awaiting_input') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-status-warning animate-pulse mx-1"
        aria-label="Awaiting input"
      />
    );
  }

  return <MessageSquare className="size-3.5 shrink-0" aria-hidden="true" />;
}
