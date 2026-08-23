/**
 * The actionable library controls for a linked loop: publish local drift as a new
 * version or re-sync to discard it, update to a newer version, or switch versions.
 * Status/version/unlink live in the header (LibraryLinkBadge); this only renders
 * when there's an action to take (the parent gates on status.hasActions), so a
 * simply-linked loop costs no body space. See specs/09-ui-redesign.md.
 */

import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { ArrowUpCircle, Sparkles } from 'lucide-react';
import type { Loop, OrchestratorAction } from '../../shared/types';
import { readaptPrompt } from '../lib/catalog-summary';
import type { LibraryLinkStatus } from '../lib/use-library-link';

interface LibraryLinkSectionProps {
  loop: Loop;
  status: LibraryLinkStatus;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void | Promise<void>;
}

export function LibraryLinkSection({ loop, status, busy, onAction }: LibraryLinkSectionProps) {
  const { version, latest, updateAvailable, diverged, sourceRemoved, versions, fromCatalog } = status;
  const running = !!loop.runtime.activeRunId;

  // Catalog loops: a plain switch lands the new *generic* curated plan, so the
  // primary update path chains the switch with a re-adaptation refine that
  // carries the user's original install answers (readaptPrompt).
  const updateAndReadapt = async () => {
    await onAction({ kind: 'library_set_version', loopId: loop.id, version: latest! });
    await onAction({ kind: 'revise', loopId: loop.id, prompt: readaptPrompt(loop) });
  };

  return (
    <Card className="flex flex-col gap-2 p-3 text-base">
      {sourceRemoved && (
        <span className="text-xs text-amber-400">The library entry for this Workflow was removed. The current plan is unchanged.</span>
      )}

      {diverged && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">This Workflow’s steps differ from v{version}.</span>
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
        <div className="flex flex-wrap items-center gap-2">
          {fromCatalog && (
            <Button
              size="xs"
              disabled={busy || running}
              onClick={() => void updateAndReadapt()}
              title={running ? 'Finish or stop the current run first' : `Switch to v${latest}, then re-adapt it to this workspace`}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Update & re-adapt to v{latest}
            </Button>
          )}
          <Button
            size="xs"
            variant={fromCatalog ? 'ghost' : 'default'}
            className="self-start"
            disabled={busy || running}
            onClick={() => onAction({ kind: 'library_set_version', loopId: loop.id, version: latest! })}
            title={running ? 'Finish or stop the current run first' : fromCatalog ? `Switch to v${latest} exactly as published` : `Update to v${latest}`}
          >
            <ArrowUpCircle className="mr-1 h-3.5 w-3.5" /> Update to v{latest}
          </Button>
        </div>
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
