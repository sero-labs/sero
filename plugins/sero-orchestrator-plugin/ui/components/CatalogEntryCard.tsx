/**
 * One catalog entry card: curated metadata, trust origin (verified badge for
 * the official repo, source key otherwise), and the install action for its
 * current state. Detail (limitations, required tools, the steps the Workflow
 * runs, example output) expands in place.
 *
 * The drawn shapes govern (prototype frame 4): a `✓` glyph for the verified
 * mark, a text-only Install, and the drawn triangle for the fold.
 */

import { useState } from 'react';
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

/** The drawn fold marker: a right-pointing triangle that turns down when open. */
function FoldMarker({ open }: { open: boolean }) {
  return open
    ? <span aria-hidden className="inline-block size-0 shrink-0 border-x-4 border-x-transparent border-t-4 border-t-room-text3" />
    : <span aria-hidden className="inline-block size-0 shrink-0 border-y-4 border-y-transparent border-l-[5px] border-l-room-text3" />;
}

export function CatalogEntryCard({ entry, official, state, busy, onInstall, onShowInLibrary }: CatalogEntryCardProps) {
  const [open, setOpen] = useState(false);
  const { meta } = entry;
  const steps = entry.definition.plan.steps;
  const hasDetail = !!(meta.limitations || meta.requiredTools?.length || steps.length > 0 || entry.exampleOutput);

  return (
    <Card className="flex flex-col gap-2 rounded-lg border-border/75 px-4 py-3" data-catalog-entry={`${entry.repoKey}/${meta.slug}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-base font-medium">{meta.name}</span>
            {official ? (
              <span className="shrink-0 text-sm text-primary" title="From the official Sero catalog, reviewed by the Sero team">
                ✓ Verified
              </span>
            ) : (
              <span className="shrink-0 rounded-md bg-room-raised px-2 py-0.5 text-sm text-room-text3" title="From a catalog repo you added">
                {entry.repoKey}
              </span>
            )}
          </div>
          <div className="text-sm text-room-text3">{meta.description}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {entryChips(meta).map((chip) => (
              <span key={chip.label} title={chip.title} className="rounded-md bg-room-raised px-2 py-0.5 text-sm text-room-text2">
                {chip.label}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {state.state === 'not-installed' && (
            <Button size="sm" disabled={busy} onClick={onInstall} title="Install into your library and adapt it to this workspace">
              Install
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
              <Button size="sm" variant="ghost" disabled={busy} onClick={onInstall} title="Create another draft Workflow from the installed version">
                New draft
              </Button>
            </>
          )}
          {state.state === 'update-available' && (
            <>
              <Button size="sm" disabled={busy} onClick={onInstall} title={`You have catalog v${state.installedCatalogVersion}; this installs v${meta.version} as a new library version and a fresh draft`}>
                Install update
              </Button>
              <button
                type="button"
                className="text-sm text-room-text3 underline-offset-2 hover:underline"
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
          <button type="button" className="flex items-center gap-1.5 text-sm text-room-text3" onClick={() => setOpen(!open)}>
            <FoldMarker open={open} /> Details
          </button>
          {open && (
            <div className="mt-1.5 flex flex-col gap-1.5 text-sm">
              {meta.limitations && <p className="text-room-text3">{meta.limitations}</p>}
              {!!meta.requiredTools?.length && (
                <p className="text-room-text3">Needs tools: {meta.requiredTools.join(', ')}</p>
              )}
              {steps.length > 0 && (
                <ol className="ml-5 list-decimal text-room-text2">
                  {steps.map((step) => <li key={step.id}>{step.title}</li>)}
                </ol>
              )}
              {entry.exampleOutput && (
                <pre className="max-h-56 overflow-auto rounded-md bg-room-sunken p-2 text-sm leading-snug text-room-text2">{entry.exampleOutput}</pre>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
