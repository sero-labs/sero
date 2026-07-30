import { Button, ScrollArea } from '@sero-ai/ui';
import { Copy, Library, RotateCw, Shuffle, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { DesignAsset } from '../../../../shared/media';
import { capabilityLabel, formatCost, trayView, type AssetView } from '../../../lib/asset-view';
import { AssetTile } from './AssetTile';
import { Block, Field } from './Field';

/**
 * The Design's asset tray (spec §6.6).
 *
 * Assets belong to the Design rather than to a variant, which is the whole of
 * "reusable across variants": the same artwork stays put while variants come and
 * go, and the tray is the same wherever you are standing in the Design.
 *
 * Contact sheet plus detail, rather than a list of rows. The tiles are what make
 * a tray of artwork worth looking at, and the inspector is narrow enough that
 * rows would show a thumbnail the size of a favicon next to a truncated prompt.
 * Everything a single asset needs — its reference, what it cost, what to do
 * about it — sits under the sheet for whichever one is selected.
 */

export interface AssetsTabProps {
  designId: string;
  assets: DesignAsset[];
  onRetry(assetId: string): void;
  onCopyToLibrary(assetId: string): void;
  onDelete(assetId: string): void;
  /** Opens the generation dialog for this Design. */
  onGenerate(): void;
  /** Opens Remix with this ready image selected as its source. */
  onRemix(assetId: string): void;
}

export function AssetsTab({
  designId,
  assets,
  onRetry,
  onCopyToLibrary,
  onDelete,
  onGenerate,
  onRemix,
}: AssetsTabProps) {
  const tray = trayView(assets);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Falls back rather than being cleared on change: an asset can be purged or
  // deleted underneath the panel, and a stale id must not blank the detail for
  // whatever is still there.
  const selected =
    tray.assets.find((view) => view.id === selectedId) ?? tray.assets[tray.assets.length - 1];

  if (tray.assets.length === 0) {
    return (
      <div className="px-4 py-3">
        <p className="text-muted-foreground text-sm">
          No artwork yet. The model asks for it while it builds, and you can ask for it here.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onGenerate}>
          Generate artwork
        </Button>
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Block>
        <Field label="Artwork">
          <ul className="grid grid-cols-3 gap-1.5">
            {tray.assets.map((view) => (
              <AssetTile
                key={view.id}
                designId={designId}
                view={view}
                selected={view.id === selected?.id}
                onSelect={() => setSelectedId(view.id)}
              />
            ))}
          </ul>

          <div className="text-muted-foreground mt-2 flex items-baseline justify-between text-xs">
            <span>
              {tray.assets.length} asset{tray.assets.length === 1 ? '' : 's'}
              {tray.generating > 0 ? ` · ${tray.generating} generating` : ''}
            </span>
            <span className="tabular-nums">{formatCost(tray.totalCostUsd)}</span>
          </div>

          {/* Announced rather than only drawn, so a generation finishing is not
              a change only a sighted user notices. */}
          <p aria-live="polite" className="sr-only">
            {tray.generating > 0
              ? `${tray.generating} asset${tray.generating === 1 ? '' : 's'} generating`
              : `${tray.assets.length} asset${tray.assets.length === 1 ? '' : 's'} ready`}
          </p>

          <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={onGenerate}>
            Generate artwork
          </Button>
        </Field>
      </Block>

      {selected && (
        <AssetDetail
          view={selected}
          onRetry={() => onRetry(selected.id)}
          onCopyToLibrary={() => onCopyToLibrary(selected.id)}
          onDelete={() => onDelete(selected.id)}
          onRemix={() => onRemix(selected.id)}
        />
      )}
    </ScrollArea>
  );
}

interface AssetDetailProps {
  view: AssetView;
  onRetry(): void;
  onCopyToLibrary(): void;
  onDelete(): void;
  onRemix(): void;
}

function AssetDetail({ view, onRetry, onCopyToLibrary, onDelete, onRemix }: AssetDetailProps) {
  const [copied, setCopied] = useState(false);

  return (
    <>
      <Block>
        <Field label={capabilityLabel(view.capability)}>
          <p className="text-sm">{view.prompt === '' ? 'No prompt.' : view.prompt}</p>
          <p
            className={`mt-1 text-xs ${
              view.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {view.status}
          </p>
        </Field>
      </Block>

      <Block>
        <Field label="Reference">
          <div className="flex items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded px-1.5 py-1 font-mono text-xs">
              {view.reference}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label="Copy the reference"
              onClick={() => {
                void navigator.clipboard.writeText(view.reference);
                setCopied(true);
              }}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          {/* The reference is fixed at reservation and never moves, which is
              what makes it safe to paste into a page before the artwork lands. */}
          <p aria-live="polite" className="text-muted-foreground mt-1 text-xs">
            {copied ? 'Copied.' : 'Stable across retries.'}
          </p>
        </Field>
      </Block>

      <Block>
        <Field label="Spend">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">
              {view.attemptCount} attempt{view.attemptCount === 1 ? '' : 's'}
            </span>
            <span className="tabular-nums">{formatCost(view.costUsd)}</span>
          </div>
        </Field>
      </Block>

      <Block>
        {/* Wraps rather than compresses. An action named in full is worth a
            second line at the inspector's narrowest — "Library" on its own fit,
            and read as a label nobody could act on. Only the actions that apply
            to this asset are drawn: a disabled button beside a failed generation
            says the tray is broken, where its absence says nothing at all. */}
        <div className="flex flex-wrap items-center gap-2">
          {view.state === 'ready' && view.kind === 'image' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 flex-1"
              onClick={onRemix}
            >
              <Shuffle className="size-3.5" />
              Remix
            </Button>
          )}

          {view.canRetry && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 flex-1"
              onClick={onRetry}
            >
              <RotateCw className="size-3.5" />
              Retry
            </Button>
          )}

          {view.canCopy && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 basis-36"
              onClick={onCopyToLibrary}
            >
              <Library className="size-3.5" />
              <span className="truncate">Copy to Library</span>
            </Button>
          )}

          {view.copiedItemId !== undefined && (
            <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
              In the Library
            </span>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Delete this asset"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </Block>
    </>
  );
}
