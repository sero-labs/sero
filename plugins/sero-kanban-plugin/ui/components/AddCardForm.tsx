/**
 * AddCardForm — inline form to add a new card to the backlog.
 *
 * AnimatePresence for smooth appear/disappear.
 */

import { useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Priority } from '../../shared/types';

export function AddCardForm({
  onAdd,
}: {
  onAdd: (title: string, priority: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed) return;
      onAdd(trimmed, priority);
      setTitle('');
      setPriority('medium');
      inputRef.current?.focus();
    },
    [title, priority, onAdd],
  );

  const handleOpen = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  return (
    <div className="px-3 pb-3">
      <AnimatePresence mode="wait">
        {!open ? (
          <motion.button
            key="trigger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleOpen}
            className="w-full rounded-lg border border-dashed border-[var(--kb-border)] py-2 text-xs text-[var(--kb-dim)] transition-colors hover:border-[var(--kb-accent)]/40 hover:text-[var(--kb-muted)]"
          >
            + Add card
          </motion.button>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            onSubmit={handleSubmit}
            className="space-y-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Card title..."
              className="w-full rounded-md border border-[var(--kb-border)] bg-[var(--kb-elevated)] px-2.5 py-1.5 text-xs text-[var(--kb-text)] placeholder-[var(--kb-dim)] outline-none transition-colors focus:border-[var(--kb-accent)]"
            />
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                      priority === p
                        ? 'bg-[var(--kb-accent)]/20 text-[var(--kb-accent)]'
                        : 'text-[var(--kb-dim)] hover:text-[var(--kb-muted)]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setTitle('');
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--kb-dim)] transition-colors hover:text-[var(--kb-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  className="rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1 text-[11px] font-medium text-[var(--kb-accent)] transition-all disabled:opacity-30"
                >
                  Add
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
