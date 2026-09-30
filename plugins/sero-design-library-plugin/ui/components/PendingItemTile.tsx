import { useState } from 'react';
import { Button, SubagentLiveBlock } from '@sero-ai/ui';
import { AlertTriangle, Eye, Loader2 } from 'lucide-react';

import type { PendingGeneration } from '../lib/pending-generations';

/**
 * A Library item that has been asked for but has not arrived (D3, D5).
 *
 * Keyed on the job's slot, which is the same id the request carried: a replay
 * finds the job that already owns the slot rather than starting a second.
 *
 * While the job has a model run behind it the eye opens that run's live block in
 * place of the spinner; closing it puts the spinner back. A generation with no
 * model call keeps the spinner, because there is nothing to watch.
 */

export interface PendingItemTileProps {
  generation: PendingGeneration;
  onDismiss(jobId: string): void;
}

export function PendingItemTile({ generation, onDismiss }: PendingItemTileProps) {
  const failed = generation.status === 'failed';
  const [watching, setWatching] = useState(false);
  const runId = generation.runId;

  return (
    <div
      className={`border-border flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center ${
        failed ? 'border-destructive/40 bg-destructive/5' : 'bg-muted/40'
      }`}
    >
      {failed ? (
        <>
          <AlertTriangle className="text-destructive size-5" aria-hidden />
          <p className="text-destructive text-xs">
            {generation.error ?? 'That generation failed.'}
          </p>
          <Button type="button" variant="ghost" size="sm" onClick={() => onDismiss(generation.jobId)}>
            Dismiss
          </Button>
        </>
      ) : (
        <>
          {watching && runId ? (
            <SubagentLiveBlock className="w-full text-left" runId={runId} monospace />
          ) : (
            <>
              <Loader2
                className="text-muted-foreground size-5 animate-spin motion-reduce:animate-none"
                aria-hidden
              />
              {/* Announced, so a generation arriving is not a change only a
                  sighted user notices. */}
              <p aria-live="polite" className="text-muted-foreground text-xs">
                Generating a new reference…
              </p>
            </>
          )}
          {runId && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground grid size-6 place-items-center rounded-[5px]"
              onClick={() => setWatching((open) => !open)}
              aria-expanded={watching}
              aria-label="Watch the agent for this reference"
              title="Watch the agent"
            >
              <Eye className="size-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
