import {
  Button,
  ScrollArea,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { CircleDashed, Heart, Plus, Shapes } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AnimationSummary, CharacterSummary } from '../../shared/state';
import { NavigationRailHeading, NavigationRailRow } from '../../../ui/components/NavigationRail';
import { CharacterCard } from './CharacterCard';

/**
 * The shelf.
 *
 * A character owns its palette, its size and its anchor, and every animation
 * belongs to it. That ownership is what lets someone come back next week, ask
 * for a jump, and get a sprite that matches — so the shelf is characters, and
 * animations are found inside one.
 */

type Scope = 'all' | 'favourites' | 'awaiting';

const ANY = 'any';

interface CharacterShelfProps {
  characters: CharacterSummary[];
  animations: AnimationSummary[];
  openCharacterId: string | undefined;
  onOpen(characterId: string): void;
  onFavourite(characterId: string, favourite: boolean): void;
  onNew(): void;
}

function awaitingYou(character: CharacterSummary): boolean {
  return character.status === 'draft' || character.awaitingApproval > 0;
}

export function CharacterShelf({
  characters,
  animations,
  openCharacterId,
  onOpen,
  onFavourite,
  onNew,
}: CharacterShelfProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [size, setSize] = useState(ANY);
  const [source, setSource] = useState(ANY);

  const sizes = useMemo(
    () => [...new Set(characters.map((one) => `${one.artWidth} × ${one.artHeight}`))].toSorted(),
    [characters],
  );

  const counts = {
    all: characters.length,
    favourites: characters.filter((one) => one.favourite).length,
    awaiting: characters.filter(awaitingYou).length,
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return characters.filter((character) => {
      if (scope === 'favourites' && !character.favourite) return false;
      if (scope === 'awaiting' && !awaitingYou(character)) return false;
      if (size !== ANY && `${character.artWidth} × ${character.artHeight}` !== size) return false;
      if (source !== ANY && character.source !== source) return false;
      return needle === '' || character.name.toLowerCase().includes(needle);
    });
  }, [characters, query, scope, size, source]);

  return (
    <div className="flex min-h-0 flex-1">
      <ScrollArea className="border-border h-full w-56 shrink-0 border-r">
        <nav className="p-2" aria-label="Sprite Studio navigation">
          <NavigationRailHeading>Characters</NavigationRailHeading>
          <NavigationRailRow
            active={scope === 'all'}
            label="All"
            count={counts.all}
            icon={<Shapes className="size-3.5" />}
            onClick={() => setScope('all')}
          />
          <NavigationRailRow
            active={scope === 'favourites'}
            label="Favourites"
            count={counts.favourites}
            icon={<Heart className="size-3.5" />}
            onClick={() => setScope('favourites')}
          />
          <NavigationRailRow
            active={scope === 'awaiting'}
            label="Awaiting approval"
            count={counts.awaiting}
            icon={<CircleDashed className="size-3.5" />}
            onClick={() => setScope('awaiting')}
          />
        </nav>
      </ScrollArea>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search characters"
            aria-label="Search characters"
            className="h-8 max-w-80 min-w-52 flex-1"
          />
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger className="h-8 w-36" aria-label="Size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All sizes</SelectItem>
              {sizes.map((one) => (
                <SelectItem key={one} value={one}>
                  {one}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 w-40" aria-label="Made from">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Made from anything</SelectItem>
              <SelectItem value="reference">From reference</SelectItem>
              <SelectItem value="library-item">From the Library</SelectItem>
              <SelectItem value="text">From text</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground ml-auto font-mono text-xs">
            {characters.length} characters · {animations.length} animations
          </span>
          <Button type="button" size="sm" onClick={onNew}>
            <Plus className="size-3.5" />
            New character
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {visible.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-3 px-6 py-24 text-center text-sm">
              <Shapes className="size-8" />
              <p>
                {characters.length === 0
                  ? 'Add a picture of a character, or describe one, to start.'
                  : 'No character matches.'}
              </p>
              {characters.length === 0 && (
                <Button type="button" size="sm" onClick={onNew}>
                  New character
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-3 p-4">
              {visible.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  selected={character.id === openCharacterId}
                  onOpen={() => onOpen(character.id)}
                  onFavourite={(favourite) => onFavourite(character.id, favourite)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
