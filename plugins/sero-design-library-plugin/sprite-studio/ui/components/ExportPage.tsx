import {
  Button,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { CharacterRecord } from '../../shared/character';
import type { AnimationSummary, SpriteExportOptions } from '../../shared/state';
import { useAnimationRecords } from '../hooks/useSpriteRecord';
import { DEFAULT_EXPORT_OPTIONS, buildSheet, type SheetAnimation } from '../lib/export-sheet';
import { NavigationRailHeading, NavigationRailRow } from '../../../ui/components/NavigationRail';
import { Chip, Crumbs } from './PanelParts';
import { SpritePixels } from './SpritePixels';
import { useBackdrop } from '../backdrop';

/**
 * A sheet and an atlas any engine can read (D16).
 *
 * One PNG and one Aseprite JSON. The anchor and the palette travel inside the
 * atlas, so a game does not have to be told where the feet are — and the scale
 * is a whole number, because anything else blurs the artwork.
 */

const SCALES = [1, 2, 3, 4, 6, 8];

interface ExportPageProps {
  character: CharacterRecord;
  animations: AnimationSummary[];
  onExport(animationIds: string[], options: SpriteExportOptions): void;
  onBack(): void;
}

export function ExportPage({ character, animations, onExport, onBack }: ExportPageProps) {
  const backdrop = useBackdrop();
  const [excluded, setExcluded] = useState<string[]>([]);
  const [options, setOptions] = useState<SpriteExportOptions>(DEFAULT_EXPORT_OPTIONS);

  const included = useMemo(
    () => animations.filter((animation) => !excluded.includes(animation.id)),
    [animations, excluded],
  );
  const includedIds = useMemo(() => included.map((animation) => animation.id), [included]);
  const records = useAnimationRecords(character.id, includedIds);

  const sheetAnimations = useMemo<SheetAnimation[]>(
    () =>
      included.flatMap((animation) => {
        const record = records.get(animation.id);
        if (record === undefined) return [];
        return [
          {
            id: animation.id,
            name: animation.name,
            loop: animation.loop,
            canvas: animation.canvas,
            anchor: record.anchor,
            durationsMs: record.frames.map((frame) => frame.durationMs),
          },
        ];
      }),
    [included, records],
  );

  const sheet = useMemo(
    () => buildSheet(character, sheetAnimations, options),
    [character, sheetAnimations, options],
  );
  const preview = sheetAnimations[0];
  const previewRecord = preview === undefined ? undefined : records.get(preview.id);
  const atlasText = JSON.stringify(sheet.atlas, null, 2);

  const patch = (change: Partial<SpriteExportOptions>) =>
    setOptions((current) => ({ ...current, ...change }));

  return (
    <div className="flex min-h-0 flex-1">
      <ScrollArea className="border-border h-full w-56 shrink-0 border-r">
        <nav className="p-2" aria-label="Export settings">
          <NavigationRailHeading>Include</NavigationRailHeading>
          {animations.map((animation) => {
            const on = !excluded.includes(animation.id);
            return (
              <NavigationRailRow
                key={animation.id}
                active={on}
                label={animation.name}
                count={animation.frameCount}
                icon={on ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                onClick={() =>
                  setExcluded((current) =>
                    on ? [...current, animation.id] : current.filter((id) => id !== animation.id),
                  )
                }
              />
            );
          })}
          <NavigationRailHeading>Layout</NavigationRailHeading>
          <NavigationRailRow
            active={options.layout === 'rows'}
            label="Rows per animation"
            count={sheetAnimations.length}
            onClick={() => patch({ layout: 'rows' })}
          />
          <NavigationRailRow
            active={options.layout === 'single-row'}
            label="One long row"
            count={sheet.frameCount}
            onClick={() => patch({ layout: 'single-row' })}
          />
        </nav>
      </ScrollArea>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <Crumbs trail={[{ label: character.name, onClick: onBack }]} last="export" />
          <Select
            value={String(options.scale)}
            onValueChange={(value) => patch({ scale: Number(value) })}
          >
            <SelectTrigger className="ml-3 h-8 w-24" aria-label="Scale">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALES.map((scale) => (
                <SelectItem key={scale} value={String(scale)}>
                  {scale}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-pressed={options.trim}
            onClick={() => patch({ trim: !options.trim })}
          >
            <Chip tone={options.trim ? 'on' : 'plain'}>Trim to content</Chip>
          </button>
          <button
            type="button"
            aria-pressed={options.uniformCell}
            onClick={() => patch({ uniformCell: !options.uniformCell })}
          >
            <Chip tone={options.uniformCell ? 'on' : 'plain'}>
              One cell size for every animation
            </Chip>
          </button>
          <span className="text-muted-foreground ml-auto font-mono text-xs">
            {sheet.cell.width} × {sheet.cell.height} per cell · {sheet.frameCount} frames · 1 sheet
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(atlasText)}
          >
            Copy atlas
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={sheetAnimations.length === 0}
            onClick={() => onExport(includedIds, options)}
          >
            Export · 2 files
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[1fr_24rem] gap-4 p-4">
          <div className="border-border bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border">
            <div className="border-border text-muted-foreground flex h-9 items-center gap-2 border-b px-3 text-sm">
              {character.name}.png
              <span className="ml-auto font-mono text-xs">
                {preview === undefined ? 'nothing included' : `${preview.name} row, shown at 1×`}
              </span>
            </div>
            <div
              className="flex min-h-0 flex-1 items-center gap-0 overflow-x-auto p-4"
              style={backdrop}
            >
              {previewRecord?.frames.map((frame, index) => (
                <SpritePixels
                  key={frame.id}
                  path={frame.file}
                  version={previewRecord.updatedAt}
                  cols={previewRecord.canvas.cols}
                  rows={previewRecord.canvas.rows}
                  scale={1}
                  alt={`Frame ${index + 1}`}
                  className="shrink-0"
                />
              ))}
            </div>
          </div>

          <div className="border-border bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border">
            <div className="border-border text-muted-foreground flex h-9 items-center gap-2 border-b px-3 text-sm">
              {character.name}.json
              <span className="ml-auto font-mono text-xs">Aseprite format</span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <pre className="text-muted-foreground p-3 font-mono text-xs leading-relaxed">
                {atlasText}
              </pre>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
