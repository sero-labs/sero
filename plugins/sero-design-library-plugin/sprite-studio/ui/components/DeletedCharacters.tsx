import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from '@sero-ai/ui';
import { useState } from 'react';

import type { CharacterSummary } from '../../shared/state';

/**
 * Characters that were deleted, and the two things that can be done about them.
 *
 * Deleting a character has always been a flag on the record, and the shelf then
 * filtered it out for ever. The requests to bring one back or clear it out
 * existed and nothing called either, so the base pose, the animations, the
 * frames and the paid clips sat on disk out of sight with no way to reach them.
 * A soft delete with nowhere to go is a leak wearing the costume of a safety
 * net, and this is the way out of it.
 */

interface DeletedCharactersProps {
  characters: CharacterSummary[];
  onRestore(characterId: string): void;
  onPurge(characterId: string): void;
}

export function DeletedCharacters({ characters, onRestore, onPurge }: DeletedCharactersProps) {
  const [purging, setPurging] = useState<CharacterSummary | null>(null);

  if (characters.length === 0) {
    return (
      <p className="text-muted-foreground px-6 py-24 text-center text-sm">
        Nothing has been deleted.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {characters.map((character) => (
        <div
          key={character.id}
          className="border-border flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate">{character.name}</span>
          <span className="text-muted-foreground font-mono text-xs">
            {character.animationCount} animations
          </span>
          <Button type="button" size="sm" variant="outline" onClick={() => onRestore(character.id)}>
            Restore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => setPurging(character)}
          >
            Delete for ever
          </Button>
        </div>
      ))}

      <AlertDialog open={purging !== null} onOpenChange={(open) => !open && setPurging(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {purging?.name} for ever?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the character, its base pose, and all {purging?.animationCount ?? 0} of
              its animations with the clips they were made from. The clips were paid for and cannot
              be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (purging !== null) onPurge(purging.id);
                setPurging(null);
              }}
            >
              Delete for ever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
