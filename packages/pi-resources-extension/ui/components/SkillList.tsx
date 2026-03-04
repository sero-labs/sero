/**
 * SkillList — scrollable list of skill cards in the left panel.
 *
 * Selection is keyed by filePath (unique), not name (can collide
 * across nested skill directories).
 */

import { cn } from '@sero/ui/lib/utils';
import type { SkillSummary } from './types';

interface SkillListProps {
  skills: SkillSummary[];
  /** Currently selected filePath. */
  selected: string | null;
  /** Called with the skill's filePath. */
  onSelect: (filePath: string) => void;
}

export function SkillList({ skills, selected, onSelect }: SkillListProps) {
  if (skills.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">No skills found</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          Click + to create one
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {skills.map((skill) => (
        <button
          key={skill.filePath}
          onClick={() => onSelect(skill.filePath)}
          className={cn(
            'flex w-full flex-col gap-0.5 border-b border-border/50 px-3 py-2.5 text-left transition-colors',
            'hover:bg-secondary/50',
            selected === skill.filePath && 'bg-secondary border-l-2 border-l-primary',
          )}
        >
          <span className="text-sm font-medium text-foreground truncate">
            {skill.name}
          </span>
          <p className="text-[11px] text-muted-foreground truncate leading-snug">
            {skill.description || 'No description'}
          </p>
        </button>
      ))}
    </div>
  );
}
