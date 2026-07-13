import {
  THINKING_LABELS,
  THINKING_LEVELS,
  type ThinkingLevel,
} from '@sero-ai/common';
import { cn } from '../../lib/utils';

interface ThinkingLevelPickerProps {
  value: string;
  onChange: (value: ThinkingLevel) => void;
  availableLevels?: readonly string[];
  disabled?: boolean;
  showUnsupported?: boolean;
  className?: string;
}

export function ThinkingLevelPicker({
  value,
  onChange,
  availableLevels,
  disabled = false,
  showUnsupported = true,
  className,
}: ThinkingLevelPickerProps) {
  const allowed = new Set<string>(availableLevels ?? THINKING_LEVELS);
  const levels = showUnsupported || !availableLevels
    ? THINKING_LEVELS
    : THINKING_LEVELS.filter((level) => allowed.has(level));

  return (
    <div className={cn('grid grid-cols-6 gap-1 rounded-lg border border-border/50 bg-muted/20 p-1', className)}>
      {levels.map((level) => {
        const isActive = value === level;
        const isAvailable = allowed.has(level) || !availableLevels;
        return (
          <button
            key={level}
            type="button"
            disabled={disabled || !isAvailable}
            onClick={() => onChange(level)}
            className={cn(
              'rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
              (!isAvailable || disabled) && 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground',
            )}
          >
            {THINKING_LABELS[level]}
          </button>
        );
      })}
    </div>
  );
}
