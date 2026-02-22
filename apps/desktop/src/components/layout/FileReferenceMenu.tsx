/**
 * FileReferenceMenu — floating autocomplete for @file references.
 *
 * Appears above the chat input when the user types "@" followed by
 * optional filter text.  Fuzzy-searches workspace files (excluding
 * node_modules, .git, build dirs, etc.).
 *
 * Keyboard: ↑/↓ navigate, Enter/Tab selects, Escape dismisses.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { FileIcon } from 'lucide-react';
import { fuzzyMatchFiles, type FuzzyMatch } from '@/hooks/useWorkspaceFiles';

// ── Types ──────────────────────────────────────────────────────

interface FileReferenceMenuProps {
  /** All available file paths (relative to workspace root). */
  files: string[];
  /** Current text after "@" for filtering. */
  filter: string;
  /** Called when a file is selected. Receives the relative path. */
  onSelect: (filePath: string) => void;
  /** Called when the menu should close (Escape). */
  onClose: () => void;
  /** Whether the menu is visible. */
  open: boolean;
}

// ── Highlighted filename ──────────────────────────────────────

function HighlightedPath({
  path,
  matchIndices,
}: {
  path: string;
  matchIndices: number[];
}) {
  const indexSet = useMemo(() => new Set(matchIndices), [matchIndices]);

  return (
    <span className="min-w-0 truncate">
      {path.split('').map((char, i) => (
        <span
          key={i}
          className={indexSet.has(i) ? 'text-[var(--accent-code)] font-semibold' : undefined}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

// ── File extension icon color hint ────────────────────────────

function fileIconColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-blue-500';
    case 'js':
    case 'jsx':
      return 'text-yellow-500';
    case 'json':
      return 'text-green-500';
    case 'css':
    case 'scss':
      return 'text-purple-500';
    case 'md':
    case 'mdx':
      return 'text-gray-400';
    case 'py':
      return 'text-emerald-500';
    case 'rs':
      return 'text-orange-500';
    default:
      return 'text-[var(--text-muted)]';
  }
}

// ── Component ──────────────────────────────────────────────────

export function FileReferenceMenu({
  files,
  filter,
  onSelect,
  onClose,
  open,
}: FileReferenceMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Fuzzy-match files against the filter
  const matches: FuzzyMatch[] = useMemo(
    () => fuzzyMatchFiles(files, filter, 20),
    [files, filter],
  );

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
      if (!open || matches.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => (i + 1) % matches.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
          break;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          if (matches[selectedIndex]) {
            onSelect(matches[selectedIndex].path);
          }
          break;
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          onClose();
          break;
      }
    },
    [open, matches, selectedIndex, onSelect, onClose],
  );

  useEffect(() => {
    if (!open) return;
    // Capture phase so we intercept before the textarea handles Enter/Escape
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, handleKeyDown]);

  if (!open || matches.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-lg"
      role="listbox"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--bg-surface)] px-2 py-1.5 text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        Files
      </div>

      {/* Items */}
      {matches.map((match, idx) => {
        const isSelected = idx === selectedIndex;
        const filename = match.path.split('/').pop() ?? match.path;
        const dir = match.path.includes('/')
          ? match.path.slice(0, match.path.lastIndexOf('/'))
          : '';

        return (
          <div
            key={match.path}
            ref={(el) => {
              if (el) itemRefs.current.set(idx, el);
              else itemRefs.current.delete(idx);
            }}
            role="option"
            aria-selected={isSelected}
            className={`flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm ${
              isSelected
                ? 'bg-accent text-accent-foreground'
                : 'text-[var(--text-primary)] hover:bg-accent/50'
            }`}
            onMouseEnter={() => setSelectedIndex(idx)}
            onMouseDown={(e) => {
              e.preventDefault(); // Keep focus on textarea
              onSelect(match.path);
            }}
          >
            <FileIcon className={`size-3 shrink-0 ${fileIconColor(match.path)}`} />
            <HighlightedPath
              path={match.path}
              matchIndices={match.matchIndices}
            />
            {dir && (
              <span className="ml-auto shrink-0 truncate text-[10px] text-[var(--text-muted)]/60" style={{ maxWidth: '40%' }}>
                {dir}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
