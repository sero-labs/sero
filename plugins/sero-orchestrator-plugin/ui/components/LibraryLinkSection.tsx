/**
 * LibraryLinkSection — shows a linked loop's library status and lets the user
 * Update/Downgrade to any version or Unlink. Update-available is derived purely
 * in the renderer by comparing the loop's linked version to the watched library
 * index (push, no polling). Version switches are refused mid-run by the runtime.
 */

import { Badge, Button, Card } from '@sero-ai/ui';
import { ArrowUpCircle, Link2Off } from 'lucide-react';
import { DEFAULT_LIBRARY_INDEX } from '../../shared/defaults';
import type { Loop, LibraryIndex, OrchestratorAction } from '../../shared/types';
import { useWatchedJson } from '../lib/use-watched-json';

interface LibraryLinkSectionProps {
  loop: Loop;
  /** Resolved library dir; null until the runtime reports it. */
  libraryDir: string | null;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

export function LibraryLinkSection({ loop, libraryDir, busy, onAction }: LibraryLinkSectionProps) {
  const link = loop.libraryLink;
  const index = useWatchedJson<LibraryIndex>(libraryDir ? `${libraryDir}/index.json` : null, DEFAULT_LIBRARY_INDEX);
  if (!link) return null;

  const entry = index.entries.find((e) => e.id === link.entryId);
  const sourceRemoved = libraryDir !== null && !entry;
  const latest = entry?.latestVersion;
  const updateAvailable = latest !== undefined && latest > link.version;
  const running = !!loop.runtime.activeRunId;
  // Newest-first version numbers (versions are 1..latest).
  const versions = latest ? Array.from({ length: latest }, (_, i) => latest - i) : [];

  return (
    <Card className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{entry?.name ?? 'Saved loop'}</span>
        <span className="text-muted-foreground">on v{link.version}</span>
        {updateAvailable && <Badge variant="outline" className="border-primary/40 text-primary">v{latest} available</Badge>}
        {sourceRemoved && <Badge variant="outline" className="border-amber-500/40 text-amber-500">source removed</Badge>}
        <Button
          size="xs"
          variant="ghost"
          className="ml-auto"
          disabled={busy}
          onClick={() => onAction({ kind: 'library_unlink', loopId: loop.id })}
          title="Detach this loop from the library (keeps the current plan)"
        >
          <Link2Off className="mr-1 h-3.5 w-3.5" /> Unlink
        </Button>
      </div>

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
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">Switch version:</span>
          {versions.map((v) => (
            <Button
              key={v}
              size="xs"
              variant={v === link.version ? 'outline' : 'ghost'}
              disabled={busy || running || v === link.version}
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
