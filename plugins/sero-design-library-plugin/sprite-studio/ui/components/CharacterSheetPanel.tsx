import { Button, Input, Textarea } from '@sero-ai/ui';
import { useRef, useState } from 'react';

import { characterProblem, type CharacterRecord, type PaletteCap } from '../../shared/character';
import { resolveScale } from '../lib/export-sheet';
import { paletteLabel, parsePalette } from '../lib/palette-file';
import { Chip, DetailPanel, Field, Measure } from './PanelParts';

/**
 * The first checkpoint's panel.
 *
 * Height and palette are inherited by every animation this character will ever
 * have, which is why they are settled here and not later. Capping re-quantises
 * immediately, so the result is on screen before the character is approved and
 * before anything has been generated from it (D17).
 */

const COUNT_CAPS = [32, 16, 8];

function capMatches(cap: PaletteCap, candidate: PaletteCap): boolean {
  if (cap.kind !== candidate.kind) return false;
  if (cap.kind === 'count') return cap.count === candidate.count;
  if (cap.kind === 'fixed') return cap.label === candidate.label;
  return true;
}

interface CharacterSheetPanelProps {
  character: CharacterRecord;
  onSetCap(cap: PaletteCap): void;
  onSetExportScale(scale: number): void;
  onSetStyleNotes(notes: string): void;
  onApprove(): void;
  onAddAnimations(): void;
}

export function CharacterSheetPanel({
  character,
  onSetCap,
  onSetExportScale,
  onSetStyleNotes,
  onApprove,
  onAddAnimations,
}: CharacterSheetPanelProps) {
  const exported = {
    width: character.artWidth * character.exportScale,
    height: character.artHeight * character.exportScale,
  };
  const [wantedHeight, setWantedHeight] = useState(String(exported.height));
  const [notes, setNotes] = useState(character.styleNotes);
  const palettePicker = useRef<HTMLInputElement>(null);
  const approved = character.status === 'approved';
  // Written months ago and called by nothing until now, so a character that
  // could not work was approved as readily as one that could.
  const problem = characterProblem(character);

  const applyHeight = () => {
    const resolved = resolveScale(character.artWidth, character.artHeight, Number(wantedHeight));
    setWantedHeight(String(resolved.height));
    if (resolved.scale !== character.exportScale) onSetExportScale(resolved.scale);
  };

  const chips: { key: string; label: string; cap: PaletteCap }[] = [
    {
      key: 'measured',
      label: `${character.ingestion.measuredColours} · measured`,
      cap: { kind: 'measured' },
    },
    ...COUNT_CAPS.map((count) => ({
      key: String(count),
      label: String(count),
      cap: { kind: 'count' as const, count },
    })),
  ];

  return (
    <DetailPanel
      eyebrow="Character sheet"
      title={character.name}
      subtitle={
        approved
          ? 'Approved · every animation inherits this'
          : `From ${character.sourceFile?.split('/').at(-1) ?? 'a description'} · not yet approved`
      }
      footer={
        approved ? (
          <Button type="button" onClick={onAddAnimations}>
            Add animations
          </Button>
        ) : (
          <>
            {/* Said here, beside the button it stops. A character measured
                wrong makes every animation ever generated from it wrong, and
                each of those is a paid clip — so this is the cheapest place in
                the whole feature to refuse. */}
            {problem !== null && (
              <p className="text-destructive text-sm leading-relaxed">{problem}</p>
            )}
            <Button type="button" onClick={onApprove} disabled={problem !== null}>
              Approve character
            </Button>
          </>
        )
      }
    >
      <Field label="Height in art pixels">
        <p className="text-sm">
          <b className="font-medium">{character.artHeight}</b>
          <span className="text-muted-foreground"> px · measured from the artwork</span>
        </p>
      </Field>

      <Field label="Export size">
        <div className="flex items-center gap-2">
          <Input
            className="h-8 w-24"
            inputMode="numeric"
            aria-label="Export height in pixels"
            value={wantedHeight}
            onChange={(event) => setWantedHeight(event.target.value)}
            onBlur={applyHeight}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyHeight();
            }}
          />
          <span className="text-muted-foreground font-mono text-xs">
            {character.exportScale}× → {exported.width} × {exported.height}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">Whole numbers only, or the pixels blur.</p>
      </Field>

      <Field label={`Palette · ${character.palette.length} colours`}>
        <div className="flex flex-wrap gap-0.5">
          {character.palette.map((colour) => (
            <i
              key={colour}
              className="size-3.5 rounded-[3px]"
              style={{ background: colour }}
              aria-hidden
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button key={chip.key} type="button" onClick={() => onSetCap(chip.cap)}>
              <Chip tone={capMatches(character.cap, chip.cap) ? 'on' : 'plain'}>{chip.label}</Chip>
            </button>
          ))}
          {character.cap.kind === 'fixed' && (
            <Chip tone="on">{character.cap.label ?? 'fixed'}</Chip>
          )}
          <button type="button" onClick={() => palettePicker.current?.click()}>
            <Chip>Load…</Chip>
          </button>
          <input
            ref={palettePicker}
            type="file"
            accept=".txt,.hex,.gpl,.pal,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file === undefined) return;
              void file.text().then((text) => {
                const palette = parsePalette(text);
                if (palette.length > 0) {
                  onSetCap({ kind: 'fixed', palette, label: paletteLabel(file.name) });
                }
              });
            }}
          />
        </div>
      </Field>

      <Field label="Style notes · what must not change">
        <Textarea
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            if (notes !== character.styleNotes) onSetStyleNotes(notes);
          }}
        />
      </Field>

      <Field label="Measurements">
        <Measure
          label="Colours outside palette"
          value={`${(character.ingestion.residual / 10).toFixed(1)}%`}
          tone={character.ingestion.residual > 50 ? 'warn' : 'ok'}
        />
        <Measure
          label="Colours measured"
          value={String(character.ingestion.measuredColours)}
          tone="plain"
        />
        <Measure
          label="Grid confidence"
          value={`${character.ingestion.lift.toFixed(1)}× chance`}
          tone={character.ingestion.lift >= 2 ? 'ok' : 'warn'}
        />
      </Field>
    </DetailPanel>
  );
}
