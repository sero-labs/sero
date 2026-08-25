import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@sero-ai/ui/components/ui/dialog';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { relativeWorkspaceId, useNodesStore } from '@/stores/nodes';
import type { AgentNodeModel } from '@/types/agent-node';

const EMPTY_MODELS: AgentNodeModel[] = [];

interface NewNodeSessionDialogProps {
  nodeId: string;
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewNodeSessionDialog({ nodeId, workspaceId = '', open, onOpenChange }: NewNodeSessionDialogProps) {
  const createSession = useNodesStore((state) => state.createSession);
  const models = useNodesStore((state) => state.models[nodeId] ?? EMPTY_MODELS);
  const [workspace, setWorkspace] = useState(workspaceId);
  const [model, setModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    try {
      await createSession(nodeId, relativeWorkspaceId(workspace), model);
      setError(null);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the session');
    }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>New node session</DialogTitle></DialogHeader>
    <div className="grid gap-1.5"><Label htmlFor={`node-workspace-${nodeId}`}>Workspace</Label><Input id={`node-workspace-${nodeId}`} autoFocus={!workspaceId} value={workspace} placeholder="project" disabled={Boolean(workspaceId)} onChange={(event) => setWorkspace(event.target.value)} /></div>
    <div className="grid gap-1.5"><Label htmlFor={`node-model-${nodeId}`}>Model</Label><select id={`node-model-${nodeId}`} className="h-9 rounded-md border bg-transparent px-2 text-sm" value={model} onChange={(event) => setModel(event.target.value)}><option value="">Select a model</option>{models.map((item) => <option key={`${item.providerId}/${item.modelId}`} value={`${item.providerId}/${item.modelId}`}>{item.name} · {item.providerId}</option>)}</select>{models.length === 0 ? <p className="text-xs text-(--text-muted)">No models are available. Configure a provider in node settings.</p> : null}</div>
    {error ? <p role="alert" className="text-sm text-status-error">{error}</p> : null}
    <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!workspace.trim() || !model} onClick={() => void submit()}>Create session</Button></DialogFooter>
  </DialogContent></Dialog>;
}
