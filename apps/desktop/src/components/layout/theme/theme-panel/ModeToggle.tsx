/**
 * ModeToggle — three-way toggle for Light / Dark / System theme mode.
 */

import type { ThemeMode } from '@/types/theme';

interface ModeToggleProps {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}

const MODES: Array<{ value: ThemeMode; label: string; icon: string }> = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
  { value: 'system', label: 'System', icon: '⚙' },
];

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] p-1">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onModeChange(m.value)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium
            transition-colors
            ${mode === m.value
              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }
          `}
        >
          <span>{m.icon}</span>
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}
