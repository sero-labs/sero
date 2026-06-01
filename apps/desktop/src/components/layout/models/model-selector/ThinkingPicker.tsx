import { Brain } from 'lucide-react';
import { motion } from 'motion/react';
import { THINKING_LABELS, THINKING_LEVELS, type ThinkingLevel } from '@sero-ai/common';

export function ThinkingPicker({
  available,
  current,
  disabled,
  onSelect,
}: {
  available: string[];
  current: string;
  disabled: boolean;
  onSelect: (level: string) => void;
}) {
  const levels = disabled
    ? THINKING_LEVELS
    : THINKING_LEVELS.filter((level) => level === 'off' || available.includes(level));
  const activeIndex = levels.indexOf((disabled ? 'off' : current) as ThinkingLevel);

  return (
    <div
      className={`flex flex-col gap-1.5 border-t border-[var(--border-subtle)] px-3 py-2.5 transition-opacity duration-150 ${
        disabled ? 'pointer-events-none opacity-35' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Brain className="size-3 text-[var(--text-muted)]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Thinking
        </span>
      </div>
      <div className="relative flex rounded-lg bg-[var(--bg-base)] p-0.5">
        <motion.div
          className="absolute inset-y-0.5 rounded-md"
          initial={false}
          animate={{
            x: `${activeIndex * 100}%`,
            width: `${100 / levels.length}%`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{
            background:
              disabled || current === 'off'
                ? 'var(--bg-elevated)'
                : current === 'xhigh'
                  ? 'linear-gradient(135deg, #f59e0b33, #ef444433)'
                  : 'linear-gradient(135deg, #6366f133, #8b5cf633)',
          }}
        />
        {levels.map((level) => (
          <button type="button"
            key={level}
            onClick={() => onSelect(level)}
            className={`relative z-10 flex-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors duration-150 ${
              current === level && !disabled
                ? level === 'xhigh'
                  ? 'text-[var(--status-warning)]'
                  : level === 'off'
                    ? 'text-[var(--text-secondary)]'
                    : 'text-[var(--banner-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {THINKING_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}
