import { useState } from 'react';
import { Button } from '@sero-ai/ui';

import type { LoomGraph } from '../../shared/graph';

// Power-user / transparency escape hatch: edit the raw graph JSON directly.
export function GraphEditor({ graph, onApply }: { graph: LoomGraph; onApply: (g: LoomGraph) => void }) {
  const [text, setText] = useState(() => JSON.stringify(graph, null, 2));
  const [err, setErr] = useState('');

  const apply = () => {
    try {
      onApply(JSON.parse(text));
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <details className="border-b border-border pb-3">
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Advanced — graph JSON
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={12}
          className="w-full resize-y rounded-md border border-input bg-background p-2 font-mono text-[10px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => { setText(JSON.stringify(graph, null, 2)); setErr(''); }}>
            Load current
          </Button>
          {err && <span className="truncate text-[10px] text-destructive">{err}</span>}
        </div>
      </div>
    </details>
  );
}
