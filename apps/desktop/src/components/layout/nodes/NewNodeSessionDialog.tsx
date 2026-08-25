import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@sero-ai/ui/components/ui/dialog';
import { Input } from '@sero-ai/ui/components/ui/input';
import { Label } from '@sero-ai/ui/components/ui/label';
import { useNodesStore } from '@/stores/nodes';

export function NewNodeSessionDialog({ nodeId, workspaceId, open, onOpenChange }: { nodeId: string; workspaceId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const createSession = useNodesStore((state) => state.createSession);
  const [model, setModel] = useState('');
  const submit = async () => { await createSession(nodeId, workspaceId, model.trim()); onOpenChange(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>New node session</DialogTitle></DialogHeader><div className="grid gap-1.5"><Label>Model</Label><Input autoFocus value={model} placeholder="provider/model" onChange={(event) => setModel(event.target.value)} /></div><DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!model.trim()} onClick={() => void submit()}>Create session</Button></DialogFooter></DialogContent></Dialog>;
}
