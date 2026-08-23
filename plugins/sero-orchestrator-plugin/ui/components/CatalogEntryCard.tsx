/**
 * One catalog entry card: curated metadata, trust origin (verified badge for
 * the official repo, source key otherwise), and the install action for its
 * current state. Detail (limitations, required tools, example output) expands
 * in place.
 */

import { useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import type { CatalogEntry } from '../../shared/catalog-types';
import { entryChips, type CatalogInstallState } from '../lib/catalog-summary';

interface CatalogEntryCardProps {
  entry: CatalogEntry;
  official: boolean;
  state: CatalogInstallState;
  busy: boolean;
  onInstall: () => void;
  /** Jump to the entry's library copy in the My Library tab. */
  onShowInLibrary: (entryName: string) => void;
}

export function CatalogEntryCard({ entry, official, state, busy, onInstall, onShowInLibrary }: CatalogEntryCardProps) {
  const [open, setOpen] = useState(false);
  const { meta } = entry;
  const hasDetail = !!(meta.limitations || meta.requiredTools?.length || entry.exampleOutput);

  return (
    <Card className="flex flex-col gap-2 border-border/75 p-3" data-catalog-entry={`${entry.repoKey}/${meta.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-medium">{meta.name}</span>
            {official ? (
              <span className="flex shrink-0 items-center gap-0.5 text-sm text-primary" title="From the official Sero catalog, reviewed by the Sero team">
                <BadgeCheck className="h-3.5 w-3.5" /> Verified
              </span>
            ) : (
              <span className="shrink-0 rounded bg-muted px-1 text-sm text-muted-foreground" title="From a catalog repo you added">
                {entry.repoKey}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{meta.description}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {entryChips(meta).map((chip) => (
              <span key={chip.label} title={chip.title} className="rounded bg-accent/60 px-1.5 py-0.5 text-sm">
                {chip.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {state.state === 'not-installed' && (
            <Button size="xs" disabled={busy} onClick={onInstall} title="Install into your library and adapt it to this workspace">
              <Download className="mr-1 h-3.5 w-3.5" /> Install
            </Button>
          )}
          {state.state === 'installed' && (
            <>
              <button
                type="button"
                className="text-sm text-primary underline-offset-2 hover:underline"
                onClick={() => onShowInLibrary(state.entryName)}
                title="Already in your library — view it there"
              >
                In your library ✓
              </button>
              <Button size="xs" variant="ghost" disabled={busy} onClick={onInstall} title="Create another draft Workflow from the installed version">
                New draft
              </Button>
            </>
          )}
          {state.state === 'update-available' && (
            <>
              <Button size="xs" disabled={busy} onClick={onInstall} title={`You have catalog v${state.installedCatalogVersion}; this installs v${meta.version} as a new library version and a fresh draft`}>
                <Download className="mr-1 h-3.5 w-3.5" /> Install update
              </Button>
              <button
                type="button"
                className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => onShowInLibrary(state.entryName)}
              >
                v{state.installedCatalogVersion} in your library
              </button>
            </>
          )}
        </div>
      </div>

      {hasDetail && (
        <div className="border-t border-border pt-1.5">
          <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} Details
          </button>
          {open && (
            <div className="mt-1.5 flex flex-col gap-1.5 text-xs">
              {meta.limitations && <p className="text-muted-foreground">{meta.limitations}</p>}
              {!!meta.requiredTools?.length && (
                <p className="text-muted-foreground">Needs tools: {meta.requiredTools.join(', ')}</p>
              )}
              {entry.exampleOutput && (
                <pre className="max-h-56 overflow-auto rounded bg-muted/60 p-2 text-sm leading-snug">{entry.exampleOutput}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
