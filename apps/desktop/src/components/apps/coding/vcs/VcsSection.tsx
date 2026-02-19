/**
 * VcsSection — animated collapsible section for the VCS panel.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VcsSectionProps {
  title: string;
  count?: number;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function VcsSection({
  title,
  count,
  badge,
  actions,
  defaultOpen = true,
  children,
}: VcsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border-subtle)]/50">
      {/* Header — uses <div> so the actions slot can contain <button>s */}
      <div
        className={cn(
          'flex w-full items-center gap-1.5 px-3 py-1.5',
          'transition-colors duration-100',
          'hover:bg-[var(--bg-elevated)]/60',
        )}
      >
        {/* Clickable toggle region (left side) */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <motion.div
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <ChevronRight className="size-3 text-[var(--text-muted)]" />
          </motion.div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </span>
          {count !== undefined && count > 0 && (
            <span className="ml-0.5 rounded-full bg-[var(--bg-muted)] px-1.5 text-[10px] font-medium text-[var(--text-muted)]">
              {count}
            </span>
          )}
          {badge}
        </button>
        {/* Actions (right side, not inside toggle button) */}
        {actions && (
          <div className="flex shrink-0 items-center gap-0.5">
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
