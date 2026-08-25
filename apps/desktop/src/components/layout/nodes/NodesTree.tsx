import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, CirclePlus, Cpu, MessageSquare, Settings, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { agentNodeApi, useNodesStore, sessionLocationKey } from '@/stores/nodes';
import type { AgentNodeInfo, AgentNodeSession } from '@/types/agent-node';
import { EnrolNodeDialog } from './EnrolNodeDialog';
import { NodeSettingsDialog } from './NodeSettingsDialog';
import { NewNodeSessionDialog } from './NewNodeSessionDialog';

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
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2 pb-1 pt-2">
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
  const sessions = useNodesStore((state) => state.sessions[node.id] ?? []);
  const expanded = useNodesStore((state) => state.expandedNodeIds.has(node.id));
  const toggle = useNodesStore((state) => state.toggleNode);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const byWorkspace = useMemo(() => sessions.reduce<Record<string, AgentNodeSession[]>>((groups, session) => {
    (groups[session.workspaceId] ??= []).push(session);
    return groups;
  }, {}), [sessions]);
  return <div className="rounded-md">
    <div className="group flex items-center gap-1 px-1 py-1">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm" onClick={() => toggle(node.id)}>
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}<Cpu className="size-3.5 text-(--text-muted)" /><span className="truncate font-medium">{node.name}</span><span aria-label={node.connectionState} className={cn('ml-auto size-2 rounded-full', node.connectionState === 'connected' ? 'bg-status-success' : node.connectionState === 'reconnecting' ? 'bg-status-warning' : 'bg-status-error')} />
      </button>
      <Button size="icon-xs" variant="ghost" aria-label={`${node.name} settings`} className="opacity-0 group-hover:opacity-100" onClick={() => setSettingsOpen(true)}><Settings className="size-3" /></Button>
    </div>
    {expanded ? <div className="pl-4">{node.workspaces.map((workspace) => <WorkspaceSessions key={workspace.id} node={node} workspace={workspace} sessions={byWorkspace[workspace.id] ?? []} />)}</div> : null}
    <NodeSettingsDialog node={node} open={settingsOpen} onOpenChange={setSettingsOpen} />
  </div>;
}

function WorkspaceSessions({ node, workspace, sessions }: { node: AgentNodeInfo; workspace: { id: string; name: string }; sessions: AgentNodeSession[] }) {
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const controlAvailable = node.connectionState !== 'version-skew' && node.connectionState !== 'revoked';
  return <div><div className="group flex items-center px-2 py-1"><p className="min-w-0 flex-1 truncate text-xs font-medium text-(--text-secondary)">{workspace.name}</p><Button size="icon-xs" variant="ghost" aria-label={`New session in ${workspace.name}`} className="opacity-0 group-hover:opacity-100" disabled={!controlAvailable} onClick={() => setNewSessionOpen(true)}><CirclePlus className="size-3" /></Button></div>{sessions.map((session) => <RemoteSessionRow key={session.id} node={node} session={session} />)}<NewNodeSessionDialog nodeId={node.id} workspaceId={workspace.id} open={newSessionOpen} onOpenChange={setNewSessionOpen} /></div>;
}

function RemoteSessionRow({ node, session }: { node: AgentNodeInfo; session: AgentNodeSession }) {
  const activeKey = useNodesStore((state) => state.activeLocationKey);
  const select = useNodesStore((state) => state.selectRemoteSession);
  const deleteSession = useNodesStore((state) => state.deleteSession);
  const key = sessionLocationKey({ kind: 'node', nodeId: node.id, sessionId: session.id });
  const title = session.name || session.firstMessage || 'New chat';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(session.modified).getTime()) / 60_000));
  return <div className={cn('group flex rounded-md hover:bg-(--bg-elevated)', activeKey === key && 'bg-(--bg-elevated)')}><button type="button" className="flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left" onClick={() => select(node.id, session.id)}><MessageSquare className="mt-0.5 size-3.5 shrink-0 text-(--text-muted)" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{title}</span><span className="flex items-center gap-1 truncate text-xs text-(--text-muted)"><span className="rounded bg-(--bg-elevated) px-1">{node.name}</span><span>{session.engine} · {session.model} · {minutes}m ago</span></span></span></button><Button size="icon-xs" variant="ghost" aria-label={`Delete ${title}`} className="mt-1 opacity-0 group-hover:opacity-100" disabled={node.connectionState === 'version-skew' || node.connectionState === 'revoked'} onClick={() => void deleteSession(node.id, session.id)}><Trash2 className="size-3" /></Button></div>;
}
