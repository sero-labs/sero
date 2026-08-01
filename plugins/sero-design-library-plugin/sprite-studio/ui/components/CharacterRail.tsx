import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  ScrollArea,
} from '@sero-ai/ui';
import { Plus, Shapes, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { AnimationSummary } from '../../shared/state';
import { NavigationRailHeading, NavigationRailRow } from '../../../ui/components/NavigationRail';

/**
 * Inside one character.
 *
 * The character sheet stays reachable from every animation, because it is where
 * the palette and the size that all of them inherit are settled.
 *
 * Deleting is real and immediate, not a flag on the record. Sprite Studio
 * already has one soft delete with nowhere to go — a deleted character is
 * filtered out of the shelf for ever, and the requests that would bring it back
 * were never wired to anything — and a second one would be a second leak
 * wearing the costume of a safety net. So this asks first, and says what goes.
 */

interface CharacterRailProps {
  characterName: string;
  animations: AnimationSummary[];
  openAnimationId: string | undefined;
  onOpenSheet(): void;
  onOpenAnimation(animationId: string): void;
  onAddAnimations(): void;
  onDeleteAnimation(animationId: string): void;
}

export function CharacterRail({
  characterName,
  animations,
  openAnimationId,
  onOpenSheet,
  onOpenAnimation,
  onAddAnimations,
  onDeleteAnimation,
}: CharacterRailProps) {
  const [removing, setRemoving] = useState<AnimationSummary | null>(null);

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
          // The delete control is a sibling of the row rather than inside it:
          // the row is itself a button, and a button inside a button is not
          // clickable in any browser.
          <div key={animation.id} className="group relative">
            <NavigationRailRow
              active={animation.id === openAnimationId}
              label={animation.name}
              count={animation.frameCount}
              icon={
                animation.status === 'ready' || animation.status === 'awaiting-review' ? (
                  <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
                ) : animation.status === 'failed' ? (
                  <span className="bg-destructive size-1.5 rounded-full" aria-hidden />
                ) : (
                  <span className="bg-primary size-1.5 rounded-full" aria-hidden />
                )
              }
              onClick={() => onOpenAnimation(animation.id)}
            />
            <button
              type="button"
              aria-label={`Delete ${animation.name}`}
              onClick={() => setRemoving(animation)}
              className="text-muted-foreground hover:text-destructive absolute inset-y-0 right-1 hidden items-center px-1 group-hover:flex focus-visible:flex"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
      </nav>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {removing?.name}?</AlertDialogTitle>
            {/* What is lost, in the two things it costs: the work, and the
                money. The clip is the paid part, so it is named. */}
            <AlertDialogDescription>
              This removes its {removing?.frameCount ?? 0} frames and the clip they were made from.
              The clip was paid for and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removing !== null) onDeleteAnimation(removing.id);
                setRemoving(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}
