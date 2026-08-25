import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { AgentNodeArtifact } from '@/types/ipc-agent-node';
import { useNodesStore } from '@/stores/nodes';

const EMPTY_ARTIFACTS: AgentNodeArtifact[] = [];

function NodeArtifact({ nodeId, artifact }: { nodeId: string; artifact: AgentNodeArtifact }) {
  const readArtifact = useNodesStore((state) => state.readArtifact);
  const [url, setUrl] = useState(artifact.inlineBase64
    ? `data:${artifact.mediaType};base64,${artifact.inlineBase64}` : null);
  const load = async () => setUrl(await readArtifact(nodeId, artifact));
  return <div className="rounded-md border p-2 text-xs">
    <div className="flex items-center gap-2">
      <FileDown className="size-3.5" /><span className="min-w-0 flex-1 truncate">{artifact.name}</span>
      {url ? <a href={url} download={artifact.name} className="underline">Download</a>
        : <Button size="sm" variant="ghost" onClick={() => void load()}>Read</Button>}
    </div>
    {url && artifact.mediaType.startsWith('image/') ? <img src={url} alt={artifact.name} className="mt-2 max-h-64 max-w-full rounded" /> : null}
  </div>;
}

export function NodeArtifacts({ nodeId, sessionKey }: { nodeId: string; sessionKey: string }) {
  const artifacts = useNodesStore((state) => state.artifacts[sessionKey] ?? EMPTY_ARTIFACTS);
  if (artifacts.length === 0) return null;
  return <div className="grid gap-2 px-3 pb-2">{artifacts.map((artifact) => (
    <NodeArtifact key={artifact.id} nodeId={nodeId} artifact={artifact} />
  ))}</div>;
}
