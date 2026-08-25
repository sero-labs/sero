import { useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sero-ai/ui/components/ui/dialog';
import { Input } from '@sero-ai/ui/components/ui/input';
import type { AgentNodeController, AgentNodeInfo, AgentNodeProvider } from '@/types/agent-node';
import { useNodesStore } from '@/stores/nodes';
import { NodeAuthInteraction } from './NodeAuthInteraction';

const EMPTY_PROVIDERS: AgentNodeProvider[] = [];
const EMPTY_CONTROLLERS: AgentNodeController[] = [];

export function NodeSettingsDialog({ node, open, onOpenChange }: { node: AgentNodeInfo; open: boolean; onOpenChange: (open: boolean) => void }) {
  const providers = useNodesStore((state) => state.providers[node.id] ?? EMPTY_PROVIDERS);
  const controllers = useNodesStore((state) => state.controllers[node.id] ?? EMPTY_CONTROLLERS);
  const { loadSettings, login, logout, setApiKey, removeApiKey, revokeController, mintEnrolmentCode, remove } = useNodesStore.getState();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [enrolmentCode, setEnrolmentCode] = useState<string | null>(null);
  const controlAvailable = node.connectionState !== 'version-skew' && node.connectionState !== 'revoked';

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (next && controlAvailable) void loadSettings(node.id); }}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{node.name} settings</DialogTitle></DialogHeader>
        {!controlAvailable ? <p className="text-sm text-status-warning">Settings need a compatible, authorised node.</p> : null}
        <NodeAuthInteraction nodeId={node.id} />
        <section className="grid gap-2"><h3 className="text-sm font-semibold">Providers</h3>
          {providers.map((provider) => <div className="rounded-md border p-2" key={provider.id}>
            <div className="flex items-center justify-between gap-2"><span className="text-sm">{provider.name} · {provider.status}</span><div className="flex gap-1"><Button size="sm" variant="ghost" disabled={!controlAvailable} onClick={() => void login(node.id, provider.id)}>Sign in</Button><Button size="sm" variant="ghost" disabled={!controlAvailable} onClick={() => void logout(node.id, provider.id)}>Sign out</Button></div></div>
            <div className="mt-2 flex gap-1"><Input aria-label={`${provider.name} API key`} type="password" value={keys[provider.id] ?? ''} onChange={(event) => setKeys({ ...keys, [provider.id]: event.target.value })} /><Button size="sm" disabled={!controlAvailable || !keys[provider.id]} onClick={() => void setApiKey(node.id, provider.id, keys[provider.id])}>Save</Button><Button size="sm" variant="ghost" disabled={!controlAvailable} onClick={() => void removeApiKey(node.id, provider.id)}>Remove</Button></div>
          </div>)}
        </section>
        <section className="grid gap-2"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Controllers</h3><Button size="sm" variant="outline" disabled={!controlAvailable} onClick={() => void mintEnrolmentCode(node.id).then((value) => setEnrolmentCode(value.code))}>Add controller</Button></div>{enrolmentCode ? <p className="rounded bg-(--bg-elevated) p-2 font-mono text-sm">{enrolmentCode}</p> : null}{controllers.map((controller) => <div className="flex items-center justify-between" key={controller.id}><span className="text-sm">{controller.name}</span><Button size="sm" variant="destructive" disabled={!controlAvailable} onClick={() => void revokeController(node.id, controller.id)}>Revoke</Button></div>)}</section>
        <section className="grid gap-1"><h3 className="text-sm font-semibold">Capabilities</h3><p className="text-xs text-(--text-muted)">{node.tools.length ? node.tools.join(', ') : 'No tools declared'}</p><p className="text-xs text-(--text-muted)">Interactive terminals, browser tools, containers, previews and plugin tools are not available on Agent Nodes.</p></section>
        <section className="flex justify-end border-t pt-3"><Button variant="destructive" onClick={() => void remove(node.id).then(() => onOpenChange(false))}>Remove node</Button></section>
      </DialogContent>
    </Dialog>
  );
}
