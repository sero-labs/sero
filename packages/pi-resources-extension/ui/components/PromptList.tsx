/**
 * PromptList — scrollable list of prompt template cards in the left panel.
 *
 * Selection is keyed by filePath (unique across the prompts tree).
 */

import { cn } from '@sero-ai/ui/lib/utils';
import type { PromptTemplateSummary } from './types';

interface PromptListProps {
  prompts: PromptTemplateSummary[];
  /** Currently selected filePath. */
  selected: string | null;
  /** Called with the prompt's filePath. */
  onSelect: (filePath: string) => void;
}

export function PromptList({ prompts, selected, onSelect }: PromptListProps) {
  if (prompts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        <p className="text-xs text-muted-foreground">No prompt templates found</p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          Click + to create one
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {prompts.map((prompt) => (
        <button
          key={prompt.filePath}
          onClick={() => onSelect(prompt.filePath)}
          className={cn(
            'flex w-full min-w-0 flex-col gap-0.5 overflow-hidden border-b border-border/50 px-3 py-2.5 text-left transition-colors',
            'hover:bg-secondary/50',
            selected === prompt.filePath && 'bg-secondary border-l-2 border-l-primary',
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              /{prompt.name}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground break-words">
            {prompt.description || 'No description'}
          </p>
          {prompt.relativePath.includes('/') && (
            <p className="text-[10px] text-muted-foreground/50 break-words">
              {prompt.relativePath}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
