/**
 * SlashCommandMenu — floating autocomplete for PI slash commands.
 *
 * Appears above the chat input when the user types "/" at the start.
 * Groups commands by source (Extensions, Prompts, Skills) matching
 * the PI CLI ordering.
 *
 * Keyboard: ↑/↓ navigate, Enter selects, Escape dismisses.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Terminal, FileText, Sparkles } from 'lucide-react';
import type { SeroSlashCommandInfo } from '@/types/ipc';

// ── Types ──────────────────────────────────────────────────────

interface SlashCommandMenuProps {
  /** All available commands for the session. */
  commands: SeroSlashCommandInfo[];
  /** Current text after "/" for filtering. */
  filter: string;
  /** Called when a command is selected. */
  onSelect: (command: SeroSlashCommandInfo) => void;
  /** Called when the menu should close (Escape). */
  onClose: () => void;
  /** Whether the menu is visible. */
  open: boolean;
}

// ── Source metadata (PI CLI ordering) ──────────────────────────

const SOURCE_ORDER: SeroSlashCommandInfo['source'][] = ['extension', 'prompt', 'skill'];

const SOURCE_LABELS: Record<SeroSlashCommandInfo['source'], string> = {
  extension: 'Extensions',
  prompt: 'Prompts',
  skill: 'Skills',
};

function SourceIcon({ source }: { source: SeroSlashCommandInfo['source'] }) {
  switch (source) {
    case 'extension':
      return <Terminal className="size-3 shrink-0 text-[var(--text-muted)]" />;
    case 'prompt':
      return <FileText className="size-3 shrink-0 text-[var(--text-muted)]" />;
    case 'skill':
      return <Sparkles className="size-3 shrink-0 text-[var(--text-muted)]" />;
  }
}

// ── Component ──────────────────────────────────────────────────

export function SlashCommandMenu({
  commands,
  filter,
  onSelect,
  onClose,
  open,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Filter commands by name only (case-insensitive substring match).
  // Matches PI CLI behavior — description is not searched.
  const filtered = useMemo(() => {
    const query = filter.toLowerCase();
    if (!query) return commands;
    return commands.filter((cmd) => cmd.name.toLowerCase().includes(query));
  }, [commands, filter]);

  // Group filtered commands by source in PI CLI order
  const groups = useMemo(() => {
    const result: { source: SeroSlashCommandInfo['source']; items: SeroSlashCommandInfo[] }[] = [];
    for (const source of SOURCE_ORDER) {
      const items = filtered.filter((cmd) => cmd.source === source);
      if (items.length > 0) {
        result.push({ source, items });
      }
    }
    return result;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filter]);

  // Scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard handler — attached to document when open
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open || flatItems.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => (i + 1) % flatItems.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (flatItems[selectedIndex]) {
            onSelect(flatItems[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [open, flatItems, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!open) return;
    // Capture phase so we intercept before the textarea handles Enter/Escape
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, handleKeyDown]);

  if (!open || flatItems.length === 0) return null;

  let flatIndex = 0;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-md border border-border/50 bg-[var(--bg-surface)] shadow-lg"
      role="listbox"
    >
      {groups.map(({ source, items }) => (
        <div key={source}>
          {/* Group header */}
          <div className="sticky top-0 z-10 bg-[var(--bg-surface)] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {SOURCE_LABELS[source]}
          </div>

          {/* Items */}
          {items.map((cmd) => {
            const idx = flatIndex++;
            const isSelected = idx === selectedIndex;

            return (
              <div
                key={`${source}-${cmd.name}`}
                ref={(el) => {
                  if (el) itemRefs.current.set(idx, el);
                  else itemRefs.current.delete(idx);
                }}
                role="option"
                aria-selected={isSelected}
                className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs ${
                  isSelected
                    ? 'bg-accent text-accent-foreground'
                    : 'text-[var(--text-primary)] hover:bg-accent/50'
                }`}
                onMouseEnter={() => setSelectedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault(); // Keep focus on textarea
                  onSelect(cmd);
                }}
              >
                <SourceIcon source={source} />
                <span className="font-medium">/{cmd.name}</span>
                {cmd.description && (
                  <span className="truncate text-[var(--text-muted)]">
                    {cmd.description}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
