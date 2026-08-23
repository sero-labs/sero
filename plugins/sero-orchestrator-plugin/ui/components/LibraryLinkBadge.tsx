/**
 * Compact library link status for the loop detail header (specs/09-ui-redesign.md):
 * the linked version, an update/diverged indicator, and Unlink — sitting next to
 * the status badge so a simply-linked loop costs no body space. The richer
 * controls (update, re-sync, version switch) live in the body Library section,
 * which only renders when there's something to do.
 */

import { Button } from '@sero-ai/ui/components/ui/button';
import { Bookmark, Link2Off } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import type { LibraryLinkStatus } from '../lib/use-library-link';

interface LibraryLinkBadgeProps {
  loop: Loop;
  status: LibraryLinkStatus;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

export function LibraryLinkBadge({ loop, status, busy, onAction }: LibraryLinkBadgeProps) {
  const { version, latest, updateAvailable, diverged, sourceRemoved } = status;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border py-0.5 pl-2 pr-0.5 text-xs text-muted-foreground"
      title={`${status.entryName} · linked to v${version}`}
    >
      <Bookmark className="h-3 w-3" />
      <span className="font-medium text-foreground">v{version}</span>
      {updateAvailable && <span className="font-medium text-primary">↑v{latest}</span>}
      {diverged && <span className="text-amber-400" title="Modified locally">●</span>}
      {sourceRemoved && <span className="text-amber-400" title="Library source removed">⚠</span>}
      <Button
        size="xs"
        variant="ghost"
        className="h-5 px-1 text-muted-foreground"
        disabled={busy}
        onClick={() => onAction({ kind: 'library_unlink', loopId: loop.id })}
        title="Detach this Workflow from the Library (keeps the current plan)"
        aria-label="Unlink from Library"
      >
        <Link2Off className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
