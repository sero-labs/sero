/**
 * SlashCommandMenu — floating autocomplete for PI slash commands.
 *
 * Appears above the chat input when the user types "/" at the start.
 * Groups commands by source (Extensions, Prompts, Skills) matching
 * the PI CLI ordering.
 *
 * Keyboard: ↑/↓ navigate, Enter selects, Escape dismisses.
 */

import { useMemo } from 'react';
import { Terminal, FileText, Sparkles } from 'lucide-react';
import type { SeroSlashCommandInfo } from '@/types/ipc';
import {
  AutocompleteListbox,
  AutocompleteListboxHeader,
  AutocompleteListboxOption,
  useAutocompleteListbox,
} from './AutocompleteListbox';

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

export function SlashCommandMenu({
  commands,
  filter,
  onSelect,
  onClose,
  open,
}: SlashCommandMenuProps) {
  const filtered = useMemo(() => {
    const query = filter.toLowerCase();
    if (!query) return commands;
    return commands.filter((cmd) => cmd.name.toLowerCase().includes(query));
  }, [commands, filter]);

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

  const flatItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const listbox = useAutocompleteListbox({
    items: flatItems,
    open,
    onSelect,
    onClose,
    resetKey: filter,
  });

  if (!open || flatItems.length === 0) return null;

  let flatIndex = 0;

  return (
    <AutocompleteListbox>
      {groups.map(({ source, items }) => (
        <div key={source}>
          <AutocompleteListboxHeader>{SOURCE_LABELS[source]}</AutocompleteListboxHeader>
          {items.map((cmd) => {
            const index = flatIndex++;
            const isSelected = index === listbox.selectedIndex;

            return (
              <AutocompleteListboxOption
                key={`${source}-${cmd.name}`}
                optionRef={listbox.registerItemRef(index)}
                selected={isSelected}
                onMouseEnter={() => listbox.setSelectedIndex(index)}
                onMouseDown={(event) => listbox.handleItemMouseDown(event, cmd)}
              >
                <SourceIcon source={source} />
                <span className="font-medium">/{cmd.name}</span>
                {cmd.description && (
                  <span className="truncate text-xs text-[var(--text-muted)]">
                    {cmd.description}
                  </span>
                )}
              </AutocompleteListboxOption>
            );
          })}
        </div>
      ))}
    </AutocompleteListbox>
  );
}
