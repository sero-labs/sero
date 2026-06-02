/**
 * EditorThemePicker, popover dropdown that lets the user pick a Monaco
 * color scheme. The choice is persisted via the app store.
 */

import { useMemo, useState } from 'react';
import { Palette, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { cn } from '@sero-ai/ui/lib/utils';
import { useAppStore } from '@/stores/app';
import {
  AUTO_EDITOR_THEME_ID,
  EDITOR_THEMES,
  getEditorTheme,
  type EditorThemeEntry,
} from './monaco-themes';

export function EditorThemePicker() {
  const editorThemeId = useAppStore((s) => s.editorThemeId);
  const setEditorThemeId = useAppStore((s) => s.setEditorThemeId);
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const dark: EditorThemeEntry[] = [];
    const light: EditorThemeEntry[] = [];
    for (const entry of EDITOR_THEMES) {
      (entry.kind === 'dark' ? dark : light).push(entry);
    }
    return { dark, light };
  }, []);

  const activeLabel = editorThemeId === AUTO_EDITOR_THEME_ID
    ? 'Auto'
    : getEditorTheme(editorThemeId)?.label ?? 'Auto';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Editor color theme"
              className={cn(
                'inline-flex size-7 items-center justify-center transition-colors duration-150',
                open
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-secondary)]',
              )}
            >
              <Palette className="size-3.5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Editor theme, {activeLabel}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-56 p-1"
        sideOffset={4}
      >
        <ThemeOption
          id={AUTO_EDITOR_THEME_ID}
          label="Auto (system)"
          active={editorThemeId === AUTO_EDITOR_THEME_ID}
          onSelect={() => {
            setEditorThemeId(AUTO_EDITOR_THEME_ID);
            setOpen(false);
          }}
        />
        <GroupHeader label="Dark" />
        {groups.dark.map((entry) => (
          <ThemeOption
            key={entry.id}
            id={entry.id}
            label={entry.label}
            active={editorThemeId === entry.id}
            onSelect={() => {
              setEditorThemeId(entry.id);
              setOpen(false);
            }}
          />
        ))}
        <GroupHeader label="Light" />
        {groups.light.map((entry) => (
          <ThemeOption
            key={entry.id}
            id={entry.id}
            label={entry.label}
            active={editorThemeId === entry.id}
            onSelect={() => {
              setEditorThemeId(entry.id);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
      {label}
    </div>
  );
}

function ThemeOption({
  id,
  label,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-theme-id={id}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors',
        active
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-primary)]',
      )}
    >
      <span className="truncate">{label}</span>
      {active ? <Check className="size-3 shrink-0 text-status-success" /> : null}
    </button>
  );
}
