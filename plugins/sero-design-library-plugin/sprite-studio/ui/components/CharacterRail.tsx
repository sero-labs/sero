import { ScrollArea } from '@sero-ai/ui';
import { Plus, Shapes } from 'lucide-react';

import type { AnimationSummary } from '../../shared/state';
import { NavigationRailHeading, NavigationRailRow } from '../../../ui/components/NavigationRail';

/**
 * Inside one character.
 *
 * The character sheet stays reachable from every animation, because it is where
 * the palette and the size that all of them inherit are settled.
 */

interface CharacterRailProps {
  characterName: string;
  animations: AnimationSummary[];
  openAnimationId: string | undefined;
  onOpenSheet(): void;
  onOpenAnimation(animationId: string): void;
  onAddAnimations(): void;
}

export function CharacterRail({
  characterName,
  animations,
  openAnimationId,
  onOpenSheet,
  onOpenAnimation,
  onAddAnimations,
}: CharacterRailProps) {
  return (
    <ScrollArea className="border-border h-full w-56 shrink-0 border-r">
      <nav className="p-2" aria-label={`${characterName} navigation`}>
        <NavigationRailHeading>{characterName}</NavigationRailHeading>
        <NavigationRailRow
          active={openAnimationId === undefined}
          label="Character sheet"
          count={animations.length}
          icon={<Shapes className="size-3.5" />}
          onClick={onOpenSheet}
        />
        <NavigationRailHeading
          action={
            <button type="button" aria-label="Add animations" onClick={onAddAnimations}>
              <Plus className="size-3.5" />
            </button>
          }
        >
          Animations
        </NavigationRailHeading>
        {animations.map((animation) => (
          <NavigationRailRow
            key={animation.id}
            active={animation.id === openAnimationId}
            label={animation.name}
            count={animation.frameCount}
            icon={
              animation.status === 'ready' ? (
                <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
              ) : animation.status === 'failed' ? (
                <span className="bg-destructive size-1.5 rounded-full" aria-hidden />
              ) : (
                <span className="bg-primary size-1.5 rounded-full" aria-hidden />
              )
            }
            onClick={() => onOpenAnimation(animation.id)}
          />
        ))}
      </nav>
    </ScrollArea>
  );
}
