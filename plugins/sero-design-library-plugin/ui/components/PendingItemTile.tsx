import { Button } from '@sero-ai/ui';
import { AlertTriangle, Loader2 } from 'lucide-react';

import type { PendingGeneration } from '../lib/pending-generations';

/**
 * A Library item that has been asked for but has not arrived (D3, D5).
 *
 * Keyed on the job's slot, which is the same id the request carried: a replay
 * finds the job that already owns the slot rather than starting a second.
 */

export interface PendingItemTileProps {
  generation: PendingGeneration;
  onDismiss(jobId: string): void;
}

export function PendingItemTile({ generation, onDismiss }: PendingItemTileProps) {
  const failed = generation.status === 'failed';

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
          <Loader2
            className="text-muted-foreground size-5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          {/* Announced, so a generation arriving is not a change only a sighted
              user notices. */}
          <p aria-live="polite" className="text-muted-foreground text-xs">
            Generating a new reference…
          </p>
        </>
      )}
    </div>
  );
}
