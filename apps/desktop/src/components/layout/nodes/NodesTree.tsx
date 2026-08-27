import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CirclePlus, Cpu, Settings } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { IconAction } from '@/components/ui/IconAction';
import { agentNodeApi, sessionLocationKey, useNodesStore } from '@/stores/nodes';
import { useSessionStore } from '@/stores/sessions';
import type { AgentNodeInfo, AgentNodeSession } from '@/types/agent-node';
import { EnrolNodeDialog } from './EnrolNodeDialog';
import { NodeSettingsDialog } from './NodeSettingsDialog';
import { NodeConnectionIndicator } from './NodeConnectionIndicator';
import { nodeDisplayName } from './node-display';
import { RemoteWorkspaceNode } from './RemoteWorkspaceNode';

const EMPTY_SESSIONS: AgentNodeSession[] = [];

export function NodesTree() {
  const nodes = useNodesStore((state) => state.nodes);
  const load = useNodesStore((state) => state.load);
  const handleEvent = useNodesStore((state) => state.handleEvent);
  const [enrolOpen, setEnrolOpen] = useState(false);
  useEffect(() => {
    const api = agentNodeApi();
    void load();
    return api.subscribe(handleEvent);
  }, [handleEvent, load]);

  return (
    <div className="flex flex-col gap-1 pt-2">
      <div className="flex items-center justify-between pb-1 pl-2 pr-0 pt-2">
        <span className="text-sm font-semibold uppercase tracking-[0.18em] text-(--text-secondary)">Nodes</span>
        <Button type="button" size="icon-xs" variant="ghost" aria-label="Add Agent Node" onClick={() => setEnrolOpen(true)}><CirclePlus className="size-3.5" /></Button>
      </div>
      {nodes.map((node) => <NodeRow key={node.id} node={node} />)}
      {nodes.length === 0 ? <span className="px-2 py-2 text-center text-xs text-(--text-muted)">No Agent Nodes</span> : null}
      <EnrolNodeDialog open={enrolOpen} onOpenChange={setEnrolOpen} />
    </div>
  );
}

function NodeRow({ node }: { node: AgentNodeInfo }) {
  const sessions = useNodesStore((state) => state.sessions[node.id] ?? EMPTY_SESSIONS);
  const expanded = useNodesStore((state) => state.expandedNodeIds.has(node.id));
  const toggle = useNodesStore((state) => state.toggleNode);
  const activeLocationKey = useNodesStore((state) => state.activeLocationKey);
  const searchQuery = useSessionStore((state) => state.searchQuery.trim().toLowerCase());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const byWorkspace = useMemo(() => sessions.reduce<Record<string, AgentNodeSession[]>>((groups, session) => {
    const workspace = node.workspaces.find((item) => item.id === session.workspaceId);
    if (!searchQuery || session.name?.toLowerCase().includes(searchQuery)
      || session.firstMessage?.toLowerCase().includes(searchQuery)
      || workspace?.name.toLowerCase().includes(searchQuery)) {
      (groups[session.workspaceId] ??= []).push(session);
    }
    return groups;
  }, {}), [node.workspaces, searchQuery, sessions]);
  const displayName = nodeDisplayName(node);

  return (
    <div className="py-1.5">
      <button
        type="button"
        onClick={() => toggle(node.id)}
        className="group relative mb-1 flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-[var(--text-secondary)]"
      >
        {expanded ? <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)]" /> : <ChevronRight className="size-3 shrink-0 text-[var(--text-muted)]" />}
        <Cpu className="size-4 shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{displayName}</span>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          title="Node settings"
          aria-label={`${displayName} settings`}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={(event) => { event.stopPropagation(); setSettingsOpen(true); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.stopPropagation(); setSettingsOpen(true); } }}
        >
          <Settings className="size-3" />
        </IconAction>
        <NodeConnectionIndicator state={node.connectionState} />
      </button>
      {expanded ? (
        <div className="ml-2 flex flex-col divide-y divide-(--border-subtle)/50 pl-2">
          {node.workspaces.map((workspace) => (
            <RemoteWorkspaceNode
              key={workspace.id}
              node={node}
              workspace={workspace}
              sessions={byWorkspace[workspace.id] ?? []}
              workspaceActive={sessions.some((session) => (
                session.workspaceId === workspace.id
                && activeLocationKey === sessionLocationKey({
                  kind: 'node',
                  nodeId: node.id,
                  sessionId: session.id,
                })
              ))}
            />
          ))}
          {node.workspaces.length === 0 ? <span className="px-2 py-2 text-xs text-[var(--text-muted)]">No workspaces available</span> : null}
        </div>
      ) : null}
      <NodeSettingsDialog node={node} open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
