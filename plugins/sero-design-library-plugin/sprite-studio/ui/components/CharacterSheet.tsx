import { Button } from '@sero-ai/ui';
import { RotateCw } from 'lucide-react';

import type { CharacterRecord, PaletteCap } from '../../shared/character';
import { CharacterSheetPanel } from './CharacterSheetPanel';
import { CHECKER_STYLE, SpritePixels } from './SpritePixels';
import { Crumbs, Report, ReportRow } from './PanelParts';

/**
 * The first checkpoint (D5).
 *
 * Ingestion measures the reference rather than guessing at it, and the measured
 * artwork is shown beside the original so it is obvious nothing was lost.
 * **Nothing is generated until this is approved.**
 */

/** The recovered artwork is shown at 2×, which is where its pixels read. */
const ARTWORK_SCALE = 2;
/** Taller than any pane, so the whole picture would not be on screen. */
const OVERSIZED = 700;

interface CharacterSheetProps {
  character: CharacterRecord;
  onSetCap(cap: PaletteCap): void;
  onSetExportScale(scale: number): void;
  onSetStyleNotes(notes: string): void;
  onApprove(): void;
  onAddAnimations(): void;
  onReMeasure(): void;
  onDiscard(): void;
  onFillEnclosed(fill: boolean): void;
  /** Back to the shelf. Nothing else on this screen goes there. */
  onOpenShelf(): void;
}

function Pane({
  title,
  tagline,
  checkered,
  children,
}: {
  title: string;
  tagline: string;
  checkered?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border">
      <div className="border-border text-muted-foreground flex h-9 items-center gap-2 border-b px-3 text-sm">
        {title}
        <span className="ml-auto font-mono text-xs">{tagline}</span>
      </div>
      <div
        // `relative` is what the source picture is shrunk against; see the note
        // in SpritePixels about why a percentage needs something definite here.
        className="relative grid min-h-0 flex-1 place-items-center overflow-hidden p-4"
        style={checkered === true ? CHECKER_STYLE : undefined}
      >
        {children}
      </div>
    </div>
  );
}

export function CharacterSheet({
  character,
  onSetCap,
  onSetExportScale,
  onSetStyleNotes,
  onApprove,
  onAddAnimations,
  onReMeasure,
  onDiscard,
  onOpenShelf,
  onFillEnclosed,
}: CharacterSheetProps) {
  const { ingestion, root } = character;

  return (
    // `min-w-0` so this surface shrinks beside the character rail instead of
    // pushing it off the side of the window.
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <Crumbs trail={[{ label: 'Sprite Studio', onClick: onOpenShelf }]} last={character.name} />
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={onDiscard}>
              Discard
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onReMeasure}>
              <RotateCw className="size-3.5" />
              Re-measure
            </Button>
          </div>
        </div>

        <div
          className={`grid min-h-0 flex-1 gap-4 ${
            character.sourceFile === undefined ? '' : 'grid-cols-2'
          }`}
        >
          {character.sourceFile !== undefined && (
            <Pane
              title="The file you gave me"
              tagline={`${ingestion.sourceWidth} × ${ingestion.sourceHeight} · ${ingestion.block} px per art pixel`}
            >
              <SpritePixels
                path={character.sourceFile}
                version={character.updatedAt}
                cols={ingestion.sourceWidth}
                rows={ingestion.sourceHeight}
                scale={1}
                fit
                alt={`The file ${character.name} was measured from`}
              />
            </Pane>
          )}
          <Pane
            title="The artwork underneath"
            tagline={`${character.artWidth} × ${character.artHeight} · ${character.palette.length} colours`}
            checkered
          >
            {/* A sprite is drawn at a whole scale, because that is the point.
                Artwork too big to be a sprite is shrunk to the pane instead —
                it means the measurement failed, and a picture cropped to its
                own forehead shows the user nothing about why. */}
            <SpritePixels
              path={character.basePoseFile}
              version={character.updatedAt}
              cols={character.artWidth}
              rows={character.artHeight}
              scale={ARTWORK_SCALE}
              fit={character.artHeight * ARTWORK_SCALE > OVERSIZED}
              alt={character.name}
            />
          </Pane>
        </div>

        <Report>
          {/* A grid read straight off a sharp file and one recovered from a
              softened one are both usable, and they are not the same thing.
              Saying which happened is what lets a surprising measurement be
              understood instead of doubted. */}
          <ReportRow
            check="Art grid found"
            found={
              ingestion.sharp === false
                ? `${ingestion.block} file pixels per art pixel · recovered`
                : `${ingestion.block} file pixels per art pixel`
            }
            note={
              ingestion.sharp === false
                ? 'the edges are soft, so the grid was found by allowing them a pixel'
                : `edges land on the grid ${ingestion.lift.toFixed(1)}× more often than chance`
            }
            tone={ingestion.block === 1 ? 'warn' : 'pass'}
          />
          <ReportRow
            check="Background"
            found={
              ingestion.backgroundRemoved
                ? 'removed and made transparent'
                : 'nothing to remove'
            }
            note="a painted-on checkerboard is not transparency"
          />
          {/* Offered rather than done. The picture cannot say whether white
              inside the outline is the page showing through a gap or paint the
              artist put there, so the choice is the user's — and it is a
              choice, not an edit: both directions measure again from the
              original. */}
          {(ingestion.enclosedRegions ?? 0) > 0 && (
            <ReportRow
              check="Background inside the drawing"
              found={`${ingestion.enclosedRegions} pockets · about ${ingestion.enclosedArtPixels} pixels`}
              note={
                character.fillEnclosed === true ? 'taken out' : 'kept, because it may be drawn'
              }
              tone={character.fillEnclosed === true ? 'pass' : 'warn'}
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onFillEnclosed(character.fillEnclosed !== true)}
                >
                  {character.fillEnclosed === true ? 'Put it back' : 'Take it out'}
                </Button>
              }
            />
          )}
          <ReportRow
            check="Foot line"
            found={`row ${root.footRow}, centre x ${root.centreCol}`}
            note="every animation will keep the feet here"
          />
        </Report>
      </div>

      <CharacterSheetPanel
        character={character}
        onSetCap={onSetCap}
        onSetExportScale={onSetExportScale}
        onSetStyleNotes={onSetStyleNotes}
        onApprove={onApprove}
        onAddAnimations={onAddAnimations}
      />
    </div>
  );
}
