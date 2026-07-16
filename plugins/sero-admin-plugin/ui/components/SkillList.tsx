/**
 * SkillList, scrollable list of skill cards in the left panel.
 *
 * Selection is keyed by filePath (unique), not name (can collide
 * across nested skill directories).
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SkillSummary } from './types';

interface SkillListProps {
  skills: SkillSummary[];
  /** Currently selected filePath. */
  selected: string | null;
  /** Called with the skill's filePath. */
  onSelect: (filePath: string) => void;
}

export const SkillList = memo(function SkillList({ skills, selected, onSelect }: SkillListProps) {
  if (skills.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">No skills found</p>
        <p className="mt-1 text-sm text-muted-foreground/60">
          Click + to create one
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {skills.map((skill) => (
        <button type="button"
          key={skill.filePath}
          onClick={() => onSelect(skill.filePath)}
          className={cn(
            'flex w-full min-w-0 flex-col gap-0.5 overflow-hidden border-b border-border/50 px-3 py-2.5 text-left transition-colors',
            'hover:bg-secondary/50',
            selected === skill.filePath && 'bg-secondary border-l-2 border-l-primary',
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-base font-medium text-foreground">
              {skill.name}
            </span>
            {skill.source !== 'user' && (
              <span className="shrink-0 rounded bg-muted px-1 py-px text-xs text-muted-foreground">
                {skill.source}
              </span>
            )}
          </div>
          <p className="w-full truncate text-sm leading-snug text-muted-foreground">
            {skill.description || 'No description'}
          </p>
        </button>
      ))}
    </div>
  );
});
