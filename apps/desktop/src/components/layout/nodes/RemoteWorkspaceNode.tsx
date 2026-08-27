import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Loader2, Plus } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { IconAction } from '@/components/ui/IconAction';
import { useNodesStore } from '@/stores/nodes';
import type { AgentNodeInfo, AgentNodeSession, AgentNodeWorkspace } from '@/types/agent-node';
import { canManageNode } from './node-display';
import { RemoteSessionNode } from './RemoteSessionNode';

export function RemoteWorkspaceNode({
  node,
  sessions,
  totalSessionCount,
  workspace,
  workspaceActive,
}: {
  node: AgentNodeInfo;
  sessions: AgentNodeSession[];
  totalSessionCount: number;
  workspace: AgentNodeWorkspace;
  workspaceActive: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createSession = useNodesStore((state) => state.createSession);
  const controlAvailable = canManageNode(node);

  const handleNewSession = async (event: React.MouseEvent | React.KeyboardEvent) => {
    event.stopPropagation();
    setCreating(true);
    setCreateError(null);
    try {
      await createSession(node.id, workspace.id);
      setExpanded(true);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the session');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          'group relative mb-1 flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left transition-colors',
          workspaceActive
            ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]',
        )}
      >
        {expanded ? <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)]" /> : <ChevronRight className="size-3 shrink-0 text-[var(--text-muted)]" />}
        {expanded ? (
          <FolderOpen className="size-4 shrink-0 fill-[var(--accent-primary)]/25 text-[var(--accent-primary)]" />
        ) : (
          <Folder className="size-4 shrink-0 fill-[var(--accent-primary)]/25 text-[var(--accent-primary)]" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{workspace.name}</span>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          title="New session"
          aria-label={`New session in ${workspace.name}`}
          aria-disabled={!controlAvailable || creating}
          className={cn(
            'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            (!controlAvailable || creating) && 'pointer-events-none opacity-30 group-hover:opacity-30',
          )}
          onClick={(event) => { if (controlAvailable && !creating) void handleNewSession(event); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && controlAvailable && !creating) void handleNewSession(event); }}
        >
          {creating ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
        </IconAction>
      </button>
      {createError ? <p role="alert" className="px-2 py-1 text-xs text-status-error">{createError}</p> : null}
      {expanded ? (
        <div className="ml-2 flex flex-col gap-1 pl-2">
          {totalSessionCount === 0 ? <span className="px-2 py-1 text-xs text-[var(--text-muted)]">No sessions</span> : null}
          {sessions.map((session) => <RemoteSessionNode key={session.id} node={node} session={session} />)}
        </div>
      ) : null}
    </div>
  );
}
