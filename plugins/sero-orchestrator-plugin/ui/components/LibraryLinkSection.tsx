/**
 * LibraryLinkSection — shows a linked loop's library status and lets the user
 * Update/Downgrade to any version, Unlink, or — when the loop's plan has drifted
 * from its linked version (e.g. autonomous recovery revised it) — Save the drift
 * as a new version or Re-sync back to the linked one. Update-available and
 * divergence are derived purely in the renderer (push, no polling): "available"
 * from the watched library index, "modified locally" by comparing the loop's
 * plan to the linked version's plan (ignoring local model/tool picks).
 */

import { Badge, Button, Card } from '@sero-ai/ui';
import { ArrowUpCircle, Link2Off } from 'lucide-react';
import type { LibraryIndex, LibraryVersion, Loop, OrchestratorAction } from '../../shared/types';
import { plansStructurallyDiffer } from '../../shared/library';
import { useWatchedJson } from '../lib/use-watched-json';

interface LibraryLinkSectionProps {
  loop: Loop;
  /** Resolved library dir; null until the runtime reports it. */
  libraryDir: string | null;
  /** The watched library index (entry metadata + latest version). */
  libraryIndex: LibraryIndex;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
}

export function LibraryLinkSection({ loop, libraryDir, libraryIndex, busy, onAction }: LibraryLinkSectionProps) {
  const link = loop.libraryLink;
  // Watch the linked version file to detect local drift. Hook runs unconditionally.
  const versionPath = link && libraryDir ? `${libraryDir}/entries/${link.entryId}/versions/${link.version}.json` : null;
  const linkedVersion = useWatchedJson<LibraryVersion | null>(versionPath, null);
  if (!link) return null;

  const entry = libraryIndex.entries.find((e) => e.id === link.entryId);
  const sourceRemoved = !!libraryDir && !entry;
  const latest = entry?.latestVersion;
  const updateAvailable = latest !== undefined && latest > link.version;
  const running = !!loop.runtime.activeRunId;
  const diverged = !!linkedVersion && plansStructurallyDiffer(loop.plan, linkedVersion.definition.plan);
  // Newest-first version numbers (versions are 1..latest).
  const versions = latest ? Array.from({ length: latest }, (_, i) => latest - i) : [];

  return (
    <Card className="flex flex-col gap-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{entry?.name ?? 'Saved loop'}</span>
        <span className="text-muted-foreground">on v{link.version}</span>
        {updateAvailable && <Badge variant="outline" className="border-primary/40 text-primary">v{latest} available</Badge>}
        {diverged && <Badge variant="outline" className="border-amber-500/40 text-amber-500">modified locally</Badge>}
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

      {diverged && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">This loop’s steps differ from v{link.version}.</span>
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
            onClick={() => onAction({ kind: 'library_set_version', loopId: loop.id, version: link.version })}
            title={running ? 'Finish or stop the current run first' : `Discard local changes and reload v${link.version}`}
          >
            Re-sync to v{link.version}
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
