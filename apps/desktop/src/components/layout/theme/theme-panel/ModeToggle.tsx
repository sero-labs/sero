/**
 * ModeToggle — three-way toggle for Light / Dark / System theme mode.
 */

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import type { ThemeMode } from '@/types/theme';

interface ModeToggleProps {
  mode: ThemeMode;
  onModeChange: (mode: ThemeMode) => void;
}

const MODES: Array<{ value: ThemeMode; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-[var(--bg-surface)] p-1">
      {MODES.map((m) => {
        const Icon = m.icon;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className={`
              flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium
              transition-colors
              ${mode === m.value
                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }
            `}
          >
            <Icon className="size-3.5" />
            <span>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}
