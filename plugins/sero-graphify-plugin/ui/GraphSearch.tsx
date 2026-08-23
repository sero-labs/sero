import { useState } from 'react';
import type { AppTools } from '@sero-ai/app-runtime';
import { Button, Card, Input } from '@sero-ai/ui';
import { Loader2, Search } from 'lucide-react';
import type { GraphifyState } from '../shared/types';

interface Props {
  run: AppTools['run'];
  profileGraph: GraphifyState['profileGraph'];
}

/** Search across every indexed workspace. Queries are local — they cost nothing. */
export function GraphSearch({ run, profileGraph }: Props) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

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
    <Card className="border-border/40 p-3">
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
        Profile graph: {profileGraph.status}
        {profileGraph.nodes ? ` — ${profileGraph.nodes} nodes, ${profileGraph.edges} edges` : ''}
      </p>
    </Card>
  );
}
