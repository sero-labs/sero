import { Heart } from 'lucide-react';

import type { CharacterSummary } from '../../shared/state';
import { SpritePixels, fitScale } from './SpritePixels';
import { useBackdrop } from '../backdrop';

/**
 * One character on the shelf.
 *
 * The card leads with the sprite; the counts and the palette stay quiet
 * underneath. What it says about size and palette is what every animation of
 * this character will inherit, which is the reason a character is a thing at
 * all rather than a folder of pictures.
 */

/** The stage a card's sprite is drawn into, in CSS pixels. */
const STAGE = { width: 200, height: 190 };

const SOURCE_LABEL = {
  reference: 'from reference',
  'library-item': 'from the Library',
  text: 'from text',
} as const;

interface CharacterCardProps {
  character: CharacterSummary;
  selected: boolean;
  onOpen(): void;
  onFavourite(favourite: boolean): void;
}

export function CharacterCard({ character, selected, onOpen, onFavourite }: CharacterCardProps) {
  const backdrop = useBackdrop();
  const scale = fitScale(character.artWidth, character.artHeight, STAGE.width, STAGE.height);
  const draft = character.status === 'draft';

  return (
    <article
      className={`group bg-card relative flex flex-col overflow-hidden rounded-lg border ${
        selected ? 'border-primary ring-primary/20 ring-1' : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative grid place-items-center p-3.5"
        style={{ height: STAGE.height + 28, ...backdrop }}
      >
        <span className="bg-background/70 text-muted-foreground absolute top-2 left-2 rounded px-1.5 py-0.5 font-mono text-xs">
          {character.artWidth} × {character.artHeight}
        </span>
        {character.animationCount > 0 && (
          <span className="bg-primary/10 text-primary absolute top-2 right-2 rounded px-1.5 py-0.5 font-mono text-xs">
            {character.animationCount} anims
          </span>
        )}
        <SpritePixels
          path={character.previewPath}
          version={character.updatedAt}
          cols={character.artWidth}
          rows={character.artHeight}
          scale={scale}
          alt={character.name}
        />
      </button>

      <div className="border-border border-t px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span
            className={`size-1.5 shrink-0 rounded-full ${draft ? 'bg-amber-400' : 'bg-primary'}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">{character.name}</span>
          <button
            type="button"
            aria-label={character.favourite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={character.favourite}
            onClick={() => onFavourite(!character.favourite)}
            className={`text-muted-foreground hover:text-foreground transition-opacity ${
              character.favourite ? '' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
            }`}
          >
            <Heart className={`size-3.5 ${character.favourite ? 'fill-current' : ''}`} />
          </button>
        </div>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {draft
            ? 'Awaiting your approval'
            : `${character.palette.length} colours · ${SOURCE_LABEL[character.source]}`}
        </p>
        <div className="mt-1.5 flex gap-0.5">
          {character.palette.slice(0, 7).map((colour) => (
            <i
              key={colour}
              className="size-2.5 rounded-[2px]"
              style={{ background: colour }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </article>
  );
}
