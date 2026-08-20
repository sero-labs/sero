import { Badge, Button, Card, Switch } from '@sero-ai/ui';
import { RefreshCw } from 'lucide-react';
import type { WorkspaceIndexEntry } from '../shared/types';
import { formatUsd } from '../shared/pricing';

function statusBadge(entry: WorkspaceIndexEntry) {
  if (!entry.enabled) return <Badge variant="outline">off</Badge>;
  switch (entry.status) {
    case 'building': return <Badge>building…</Badge>;
    case 'updating': return <Badge>updating…</Badge>;
    case 'queued': return <Badge variant="secondary">queued</Badge>;
    case 'needs-build': return <Badge variant="outline">not built</Badge>;
    case 'error': return <Badge variant="destructive">error</Badge>;
    default: return <Badge variant="secondary">indexed</Badge>;
  }
}

/** Cost first, then size, then the model that produced it. */
function statsLine(entry: WorkspaceIndexEntry): string | null {
  const stats = entry.stats;
  if (!stats) return null;
  const parts = [`${stats.nodes} nodes · ${stats.edges} edges`];
  if (stats.costUsd !== undefined) parts.unshift(formatUsd(stats.costUsd));
  if (stats.inputTokens > 0) {
    parts.push(`${Math.round(stats.inputTokens / 1000)}k in / ${Math.round(stats.outputTokens / 1000)}k out`);
  }
  if (stats.model) parts.push(stats.model);
  if (stats.graphifyVersion) parts.push(`graphify ${stats.graphifyVersion}`);
  return parts.join(' · ');
}

interface Props {
  entry: WorkspaceIndexEntry;
  /** True while no model is chosen — every paid action is unavailable. */
  blocked: boolean;
  onIndex: (action: 'enable' | 'disable' | 'rebuild') => void;
}

export function WorkspaceCard({ entry, blocked, onIndex }: Props) {
  const stats = statsLine(entry);
  const building = entry.status === 'building' || entry.status === 'updating';

  return (
    <Card className="flex flex-row items-center justify-between border-border/40 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{entry.name}</span>
          {statusBadge(entry)}
        </div>
        <p className="truncate text-xs text-muted-foreground">{entry.path}</p>
        {stats && <p className="text-xs text-muted-foreground">{stats}</p>}
        {entry.progress && building && (
          <p className="truncate text-xs text-muted-foreground animate-pulse" title={entry.progress}>{entry.progress}</p>
        )}
        {entry.lastError && <p className="text-xs text-destructive">{entry.lastError}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* A workspace that has never been built, or whose build failed, waits
            here for a decision. Nothing retries on its own. */}
        {entry.enabled && (entry.status === 'needs-build' || entry.status === 'error') && (
          <Button size="sm" variant="outline" disabled={blocked} onClick={() => onIndex('rebuild')}>
            {entry.status === 'error' ? 'Try again' : 'Build'}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          title="Rebuild"
          disabled={!entry.enabled || blocked || building}
          onClick={() => onIndex('rebuild')}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Switch checked={entry.enabled} onCheckedChange={(on) => onIndex(on ? 'enable' : 'disable')} />
      </div>
    </Card>
  );
}
