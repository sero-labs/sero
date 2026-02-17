/**
 * Presentational sub-components for the ContextEditor dialog.
 * Extracted to keep ContextEditor.tsx under the 500-line limit.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

// ── Collapsible Section (ToolCallGroup style) ───────────────────

export function ContextSection({
  icon: Icon,
  title,
  count,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border transition-colors duration-200',
        'border-border/50 bg-[var(--bg-elevated)]/50',
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

        <Icon className="size-3.5 text-[var(--text-muted)]" />

        <span className="text-xs font-medium text-[var(--text-secondary)]">
          {title}
        </span>

        {count !== undefined && (
          <span className="text-[11px] text-[var(--text-muted)]">
            ({count})
          </span>
        )}

        {badge && (
          <span className="ml-auto rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
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
    <div className="flex min-w-0 items-start justify-between gap-3 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium text-[var(--text-secondary)]">
          {name}
        </div>
        {description && (
          <div className="text-[10px] leading-snug text-[var(--text-muted)]/60">
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
