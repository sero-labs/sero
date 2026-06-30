/**
 * The actionable library controls for a linked loop: publish local drift as a new
 * version or re-sync to discard it, update to a newer version, or switch versions.
 * Status/version/unlink live in the header (LibraryLinkBadge); this only renders
 * when there's an action to take (the parent gates on status.hasActions), so a
 * simply-linked loop costs no body space. See specs/09-ui-redesign.md.
 */

import { Button, Card } from '@sero-ai/ui';
import { ArrowUpCircle } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import type { LibraryLinkStatus } from '../lib/use-library-link';

interface LibraryLinkSectionProps {
  loop: Loop;
  status: LibraryLinkStatus;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

export function LibraryLinkSection({ loop, status, busy, onAction }: LibraryLinkSectionProps) {
  const { version, latest, updateAvailable, diverged, sourceRemoved, versions } = status;
  const running = !!loop.runtime.activeRunId;

  return (
    <Card className="flex flex-col gap-2 p-3 text-sm">
      {sourceRemoved && (
        <span className="text-xs text-amber-400">The library entry this loop came from was removed. It stays on its current plan.</span>
      )}

      {diverged && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">This loop’s steps differ from v{version}.</span>
          <Button
            size="xs"
            disabled={busy}
            onClick={() => onAction({ kind: 'library_save', loopId: loop.id, mode: 'new-version' })}
            title="Publish these changes as a new version others can pull"
          >
            Save as new version
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={busy || running}
            onClick={() => onAction({ kind: 'library_set_version', loopId: loop.id, version })}
            title={running ? 'Finish or stop the current run first' : `Discard local changes and reload v${version}`}
          >
            Re-sync to v{version}
          </Button>
        </div>
      )}

      {updateAvailable && (
        <Button
          size="xs"
          className="self-start"
          disabled={busy || running}
          onClick={() => onAction({ kind: 'library_set_version', loopId: loop.id, version: latest! })}
          title={running ? 'Finish or stop the current run first' : `Update to v${latest}`}
        >
          <ArrowUpCircle className="mr-1 h-3.5 w-3.5" /> Update to v{latest}
        </Button>
      )}

      {versions.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Switch version:</span>
          {versions.map((v) => (
            <Button
              key={v}
              size="xs"
              variant={v === version ? 'outline' : 'ghost'}
              disabled={busy || running || v === version}
              onClick={() => onAction({ kind: 'library_set_version', loopId: loop.id, version: v })}
              title={running ? 'Finish or stop the current run first' : `Switch to v${v}`}
            >
              v{v}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
