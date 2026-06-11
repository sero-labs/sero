import { useEffect, useState } from 'react';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { Badge, Button, Card, Input, Switch } from '@sero-ai/ui';
import { Loader2, RefreshCw, Search, Waypoints } from 'lucide-react';
import { DEFAULT_STATE, type GraphifyState, type WorkspaceIndexEntry } from '../shared/types';
import './styles.css';

function statusBadge(entry: WorkspaceIndexEntry) {
  if (!entry.enabled) return <Badge variant="outline">off</Badge>;
  switch (entry.status) {
    case 'building': return <Badge>building…</Badge>;
    case 'updating': return <Badge>updating…</Badge>;
    case 'queued': return <Badge variant="secondary">queued</Badge>;
    case 'error': return <Badge variant="destructive">error</Badge>;
    default: return <Badge variant="secondary">indexed</Badge>;
  }
}

export function GraphifyApp() {
  const [state] = useAppState<GraphifyState>(DEFAULT_STATE);
  const { run } = useAppTools();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const workspaces = Object.values(state.workspaces);
  const index = (action: string, workspaceId?: string) =>
    void run('graphify_index', { action, workspace: workspaceId });

  // Push-based discovery: opening the panel asks the runtime to re-read the
  // profile workspace list, so newly created workspaces appear immediately.
  useEffect(() => {
    void run('graphify_index', { action: 'sync' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const search = async () => {
    if (!question.trim()) return;
    setSearching(true);
    try {
      const result = await run('graphify_search', { question });
      setAnswer(result.text || JSON.stringify(result));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-background p-4 text-foreground">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Graphify</h1>
          <Badge variant="outline">{state.provisioning.status}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => index('enable-all')}>Index all</Button>
      </header>

      {state.provisioning.status === 'failed' && (
        <Card className="border-destructive p-3 text-sm">{state.provisioning.error}</Card>
      )}

      <Card className="p-3">
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void search()}
            placeholder="Search across all indexed workspaces…"
          />
          <Button onClick={() => void search()} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {answer !== null && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs">{answer}</pre>}
        <p className="mt-2 text-xs text-muted-foreground">
          Profile graph: {state.profileGraph.status}
          {state.profileGraph.nodes ? ` — ${state.profileGraph.nodes} nodes, ${state.profileGraph.edges} edges` : ''}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        {workspaces.length === 0 && (
          <p className="text-sm text-muted-foreground">No workspaces discovered yet — the background runtime populates this list on startup.</p>
        )}
        {workspaces.map((entry) => (
          <Card key={entry.workspaceId} className="flex flex-row items-center justify-between p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{entry.name}</span>
                {statusBadge(entry)}
              </div>
              <p className="truncate text-xs text-muted-foreground">{entry.path}</p>
              {entry.stats && (
                <p className="text-xs text-muted-foreground">
                  {entry.stats.nodes} nodes · {entry.stats.edges} edges · {entry.stats.communities} communities
                  {entry.stats.inputTokens > 0 && ` · ${Math.round((entry.stats.inputTokens + entry.stats.outputTokens) / 1000)}k tokens used`}
                </p>
              )}
              {entry.progress && (entry.status === 'building' || entry.status === 'updating') && (
                <p className="truncate text-xs text-muted-foreground animate-pulse" title={entry.progress}>{entry.progress}</p>
              )}
              {entry.lastError && <p className="text-xs text-destructive">{entry.lastError}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="ghost" title="Rebuild" disabled={!entry.enabled} onClick={() => index('rebuild', entry.workspaceId)}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Switch checked={entry.enabled} onCheckedChange={(on) => index(on ? 'enable' : 'disable', entry.workspaceId)} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default GraphifyApp;
