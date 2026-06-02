/**
 * ViewModeToggle, code/preview toggle buttons shown in the editor tab bar
 * for file types that support both source and rendered preview modes.
 */

import { Code2, Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { cn } from '@sero-ai/ui/lib/utils';

export type ViewMode = 'code' | 'preview';

interface Props {
  viewMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}

export function ViewModeToggle({ viewMode, onModeChange }: Props) {
  return (
    <div className="flex h-full items-center overflow-hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Show source code"
            onClick={() => onModeChange('code')}
            className={cn(
              'inline-flex size-7 items-center justify-center transition-colors duration-150',
              viewMode === 'code'
                ? 'bg-status-success-subtle text-status-success'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-secondary)]',
            )}
          >
            <Code2 className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Code</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Show rendered preview"
            onClick={() => onModeChange('preview')}
            className={cn(
              'inline-flex size-7 items-center justify-center transition-colors duration-150',
              viewMode === 'preview'
                ? 'bg-status-success-subtle text-status-success'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-secondary)]',
            )}
          >
            <Eye className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Preview</TooltipContent>
      </Tooltip>
    </div>
  );
}
