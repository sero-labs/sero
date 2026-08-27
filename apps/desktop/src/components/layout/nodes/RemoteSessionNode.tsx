import { useState } from 'react';
import { Loader2, MessageSquare, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';
import { IconAction } from '@/components/ui/IconAction';
import { sessionLocationKey, useNodesStore } from '@/stores/nodes';
import type { AgentNodeInfo, AgentNodeSession } from '@/types/agent-node';
import { formatRelativeDate } from '@/components/layout/workspace/format-relative-date';
import { canManageNode } from './node-display';

export function RemoteSessionNode({ node, session }: { node: AgentNodeInfo; session: AgentNodeSession }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activeLocationKey = useNodesStore((state) => state.activeLocationKey);
  const selectRemoteSession = useNodesStore((state) => state.selectRemoteSession);
  const deleteSession = useNodesStore((state) => state.deleteSession);
  const locationKey = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
  const active = activeLocationKey === locationKey;
  const title = session.name || session.firstMessage || 'New chat';

  const handleDelete = async () => {
    setConfirmOpen(false);
    await deleteSession(node.id, session.id);
  };

  return (
    <button
      type="button"
      data-testid="remote-session-item"
      data-session-id={session.id}
      onClick={() => void selectRemoteSession(node.id, session.id)}
      className={cn(
        'group relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-elevated)]',
      )}
    >
      {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-[var(--accent-primary)]" /> : null}
      <span className="flex size-4 shrink-0 items-center justify-center">
        {session.taskId ? (
          <Loader2 className="size-4 animate-spin text-[var(--brand-primary)]" />
        ) : (
          <MessageSquare className={cn('size-3.5', active ? 'text-[var(--brand-primary)]' : 'text-[var(--text-muted)]')} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate text-sm font-medium', active ? 'text-[var(--brand-primary)]' : 'text-[var(--text-primary)]')}>
          {title}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{formatRelativeDate(session.modified)}</span>
      </span>
      <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
          <PopoverTrigger asChild>
            <IconAction
              as="span"
              role="button"
              tabIndex={-1}
              title="Delete session"
              aria-label={`Delete ${title}`}
              onClick={(event) => { event.stopPropagation(); setConfirmOpen(true); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.stopPropagation();
                  setConfirmOpen(true);
                }
              }}
            >
              <Trash2 className="size-3" />
            </IconAction>
          </PopoverTrigger>
          <PopoverContent align="start" side="right" className="w-52 p-3" onClick={(event) => event.stopPropagation()}>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">Delete this session?</p>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-base" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button size="sm" variant="destructive" className="h-6 px-2 text-base" disabled={!canManageNode(node)} onClick={() => void handleDelete()}>Delete</Button>
            </div>
          </PopoverContent>
        </Popover>
      </span>
    </button>
  );
}
