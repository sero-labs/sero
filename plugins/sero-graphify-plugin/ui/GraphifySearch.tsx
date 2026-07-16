/**
 * GraphifySearch — compact global-search panel contributed to the Sero shell
 * via `sero.app.search`. Mounted by the host in the global search overlay
 * (sidebar trigger and ⌘K); all querying stays inside this plugin.
 */

import { useState } from 'react';
import { openSeroApp, useAppState, useAppTools } from '@sero-ai/app-runtime';
import { Button, Input } from '@sero-ai/ui';
import { Loader2, Search, Waypoints } from 'lucide-react';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';
import './styles.css';

export function GraphifySearch() {
  const [state] = useAppState<GraphifyState>(DEFAULT_STATE);
  const { run } = useAppTools();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  const { profileGraph } = state;

  const search = async () => {
    const trimmed = question.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    try {
      const result = await run('graphify_search', { question: trimmed });
      setAnswer(result.text || JSON.stringify(result));
    } catch (err) {
      setAnswer(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 bg-background p-4 text-foreground">
      <div className="flex gap-2">
        <Input
          autoFocus
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          placeholder="Search across all indexed workspaces…"
        />
        <Button onClick={() => void search()} disabled={searching || !question.trim()}>
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {answer !== null ? (
          <pre className="whitespace-pre-wrap text-xs">{answer}</pre>
        ) : (
          <p className="text-base text-muted-foreground">
            {profileGraph.status === 'ready'
              ? 'Ask about any concept, file, or connection in your indexed workspaces.'
              : 'No profile graph yet — index workspaces in the Graphify app first.'}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">
          {profileGraph.status === 'ready' && profileGraph.nodes
            ? `${profileGraph.nodes} nodes · ${profileGraph.edges} edges`
            : `Profile graph: ${profileGraph.status}`}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void openSeroApp('graphify')}>
          <Waypoints className="h-4 w-4" />
          Open Graphify
        </Button>
      </footer>
    </div>
  );
}

export default GraphifySearch;
