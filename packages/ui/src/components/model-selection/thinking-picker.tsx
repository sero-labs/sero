import { Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { THINKING_LABELS, THINKING_LEVELS, type ThinkingLevel } from '@sero-ai/common';
import { cn } from '../../lib/utils';

// Compact labels so all seven segments stay on a single line and share the same
// height — "Extra High" is the only label that would otherwise wrap.
const COMPACT_LABELS: Record<ThinkingLevel, string> = {
  ...THINKING_LABELS,
  xhigh: 'X-High',
};

interface ThinkingPickerProps {
  available: readonly string[];
  current: string;
  disabled: boolean;
  onSelect: (level: string) => void;
  className?: string;
}

export function ThinkingPicker({
  available,
  current,
  disabled,
  onSelect,
  className
}: ThinkingPickerProps) {
  const levels = disabled
    ? THINKING_LEVELS
    : THINKING_LEVELS.filter((level) => level === 'off' || available.includes(level));
  const activeIndex = Math.max(
    0,
    levels.indexOf((disabled ? 'off' : current) as ThinkingLevel),
  );
  const isOff = disabled || current === 'off';
  const isMax = !disabled && current === 'max';

  return (
    <div
      className={cn(`flex flex-col gap-2 border-[var(--border-subtle)] px-3 py-3 transition-opacity duration-150 ${
        disabled ? 'pointer-events-none opacity-40' : ''
      }`, className)}
    >
      <div className="flex items-center gap-1.5">
        <Brain className="size-3 text-[var(--text-muted)]" />
        <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Thinking
        </span>
      </div>
      <div className="relative flex rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] p-0.5">
        <motion.div
          className="absolute inset-y-0.5 rounded-md shadow-sm ring-1 ring-inset ring-white/5"
          initial={false}
          animate={{
            x: `${activeIndex * 100}%`,
            width: `${100 / levels.length}%`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          style={{
            background: isOff
              ? 'var(--bg-elevated)'
              : isMax
                ? 'linear-gradient(135deg, #f59e0b40, #ef444440)'
                : 'linear-gradient(135deg, #6366f140, #8b5cf640)',
          }}
        />
        {levels.map((level) => {
          const isActive = current === level && !disabled;
          const textClass = isActive
            ? level === 'max'
              ? 'text-status-warning'
              : level === 'off'
                ? 'text-[var(--text-primary)]'
                : 'text-[var(--banner-primary)]'
            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]';
          return (
            <button
              type="button"
              key={level}
              onClick={() => onSelect(level)}
              className={`relative z-10 flex flex-1 items-center justify-center whitespace-nowrap rounded-md py-1.5 text-sm font-medium leading-none transition-colors duration-150 ${textClass}`}
            >
              {COMPACT_LABELS[level]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
