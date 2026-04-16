/**
 * FileReferenceMenu — floating autocomplete for @file references.
 *
 * Appears above the chat input when the user types "@" followed by
 * optional filter text.  Fuzzy-searches workspace files (excluding
 * node_modules, .git, build dirs, etc.).
 *
 * Keyboard: ↑/↓ navigate, Enter/Tab selects, Escape dismisses.
 */

import { useMemo } from 'react';
import { FileIcon } from 'lucide-react';
import { fuzzyMatchFiles, type FuzzyMatch } from '@/hooks/useWorkspaceFiles';
import {
  AutocompleteListbox,
  AutocompleteListboxHeader,
  AutocompleteListboxOption,
  useAutocompleteListbox,
} from './AutocompleteListbox';

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
      {path.split('').map((char, index) => (
        <span
          key={index}
          className={indexSet.has(index) ? 'text-[var(--accent-code)] font-semibold' : undefined}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

function fileIconColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-[var(--file-icon-ts)]';
    case 'js':
    case 'jsx':
      return 'text-[var(--file-icon-js)]';
    case 'json':
      return 'text-[var(--file-icon-json)]';
    case 'css':
    case 'scss':
      return 'text-[var(--file-icon-css)]';
    case 'md':
    case 'mdx':
      return 'text-[var(--file-icon-markdown)]';
    case 'py':
      return 'text-[var(--status-success)]';
    case 'rs':
      return 'text-[var(--file-icon-rust)]';
    default:
      return 'text-[var(--text-muted)]';
  }
}

export function FileReferenceMenu({
  files,
  filter,
  onSelect,
  onClose,
  open,
}: FileReferenceMenuProps) {
  const matches: FuzzyMatch[] = useMemo(() => fuzzyMatchFiles(files, filter, 20), [files, filter]);
  const listbox = useAutocompleteListbox({
    items: matches,
    open,
    onSelect: (match) => onSelect(match.path),
    onClose,
    resetKey: filter,
  });

  if (!open || matches.length === 0) return null;

  return (
    <AutocompleteListbox>
      <AutocompleteListboxHeader>Files</AutocompleteListboxHeader>
      {matches.map((match, index) => {
        const isSelected = index === listbox.selectedIndex;
        const dir = match.path.includes('/')
          ? match.path.slice(0, match.path.lastIndexOf('/'))
          : '';

        return (
          <AutocompleteListboxOption
            key={match.path}
            optionRef={listbox.registerItemRef(index)}
            selected={isSelected}
            onMouseEnter={() => listbox.setSelectedIndex(index)}
            onMouseDown={(event) => listbox.handleItemMouseDown(event, match)}
          >
            <FileIcon className={`size-3 shrink-0 ${fileIconColor(match.path)}`} />
            <HighlightedPath path={match.path} matchIndices={match.matchIndices} />
            {dir && (
              <span
                className="ml-auto shrink-0 truncate text-[10px] text-[var(--text-muted)]/60"
                style={{ maxWidth: '40%' }}
              >
                {dir}
              </span>
            )}
          </AutocompleteListboxOption>
        );
      })}
    </AutocompleteListbox>
  );
}
