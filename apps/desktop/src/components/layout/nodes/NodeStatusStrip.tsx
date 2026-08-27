import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { AgentNodeInfo } from '@/types/agent-node';

function lastSeenText(lastSeen?: string): string {
  if (!lastSeen) return 'Last seen recently.';
  const minutes = Math.max(1, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60_000));
  return `Last seen ${minutes} minute${minutes === 1 ? '' : 's'} ago.`;
}

export function NodeStatusStrip({ node, onRetry }: { node: AgentNodeInfo; onRetry: () => void }) {
  if (node.connectionState === 'connected') return null;
  const content = {
    reconnecting: 'Your task is still running on the node. Nothing is lost.',
    unreachable: lastSeenText(node.lastSeen),
    restarted: 'The turn stopped. Your session and every finished step are intact.',
    revoked: 'Running tasks were cancelled. The sessions are still there.',
    'version-skew': 'You can still send and see replies in open sessions. Lists, replay, login and settings need an update.',
  }[node.connectionState];

  return (
    <div role="status" className="flex items-center gap-2 border-b border-status-warning-border bg-status-warning-muted px-3 py-2 text-xs text-status-warning">
      {node.connectionState === 'reconnecting' ? <Loader2 className="size-3.5 animate-spin" /> : <AlertTriangle className="size-3.5" />}
      <span className="min-w-0 flex-1">{content}</span>
      {node.connectionState === 'unreachable' ? (
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onRetry}>
          <RotateCw className="size-3" /> Retry
        </Button>
      ) : null}
    </div>
  );
}
