/**
 * Presentational sub-components for the ContextEditor dialog.
 * Extracted to keep ContextEditor.tsx under the 500-line limit.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@sero/ui/lib/utils';
import { Switch } from '@sero/ui/components/ui/switch';

// ── Color tint definitions ──────────────────────────────────────

type SectionTint = 'blue' | 'amber' | 'violet' | 'neutral';
type BadgeVariant = 'default' | 'modified' | 'disabled' | 'partial';

const iconTintClass: Record<SectionTint, string> = {
  blue: 'text-blue-400 dark:text-blue-400',
  amber: 'text-amber-500 dark:text-amber-400',
  violet: 'text-violet-500 dark:text-violet-400',
  neutral: 'text-[var(--text-muted)]',
};

const badgeClass: Record<BadgeVariant, string> = {
  default: 'bg-[var(--bg-base)] text-[var(--text-muted)]',
  modified: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  disabled: 'bg-red-500/15 text-red-600 dark:text-red-400',
  partial: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
};

const sectionBorderClass: Record<BadgeVariant, string> = {
  default: 'border-border/50',
  modified: 'border-amber-500/25 dark:border-amber-500/20',
  disabled: 'border-red-500/25 dark:border-red-500/20',
  partial: 'border-blue-500/25 dark:border-blue-500/20',
};

const sectionBgClass: Record<BadgeVariant, string> = {
  default: 'bg-[var(--bg-elevated)]/50',
  modified: 'bg-amber-500/[0.03]',
  disabled: 'bg-red-500/[0.03]',
  partial: 'bg-blue-500/[0.03]',
};

// ── Collapsible Section (ToolCallGroup style) ───────────────────

export function ContextSection({
  icon: Icon,
  title,
  count,
  badge,
  badgeVariant = 'default',
  tint = 'neutral',
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  badge?: string;
  badgeVariant?: BadgeVariant;
  tint?: SectionTint;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors duration-200',
        sectionBorderClass[badgeVariant],
        sectionBgClass[badgeVariant],
      )}
    >
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-150',
          'hover:bg-[var(--bg-elevated)]/80',
        )}
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <ChevronRight className="size-3.5 text-[var(--text-muted)]" />
        </motion.div>

        <Icon className={cn('size-3.5', iconTintClass[tint])} />

        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {title}
        </span>

        {count !== undefined && (
          <span className="text-[11px] text-[var(--text-muted)]">
            ({count})
          </span>
        )}

        {badge && (
          <span
            className={cn(
              'ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium',
              badgeClass[badgeVariant],
            )}
          >
            {badge}
          </span>
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="min-w-0 border-t border-border/30 p-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Generic Toggle Row (used for both tools and skills) ─────────

export function ToggleRow({
  name,
  description,
  enabled,
  onToggle,
}: {
  name: string;
  description?: string;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-start justify-between gap-3 rounded-md px-2 py-1.5 transition-colors',
        enabled
          ? 'hover:bg-[var(--bg-elevated)]/60'
          : 'opacity-60 hover:bg-[var(--bg-elevated)]/40',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cn(
          'text-[11px] font-medium',
          enabled ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]',
        )}>
          {name}
        </div>
        {description && (
          <div className="mt-0.5 text-[10px] leading-snug text-[var(--text-muted)]/60">
            {description}
          </div>
        )}
      </div>
      <Switch
        size="sm"
        className="mt-0.5 shrink-0"
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}

// ── Save Preset Input ───────────────────────────────────────────

export function SavePresetInput({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name..."
        className="flex-1 rounded-md border border-border/50 bg-[var(--bg-base)] px-2 py-1 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)]"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) onSave(name.trim());
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button
        onClick={() => name.trim() && onSave(name.trim())}
        disabled={!name.trim()}
        className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
      >
        Cancel
      </button>
    </div>
  );
}
