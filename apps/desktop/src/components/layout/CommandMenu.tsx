import { useCallback, useEffect, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@sero/ui/components/ui/command';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { getAppIcon } from '@/lib/app-icons';
import { ThemePanel } from './ThemePanel';

/**
 * CommandMenu — ⌘K command palette for quick app switching.
 *
 * Lists all registered apps (built-in + discovered) and switches
 * to the selected app on selection. Also provides theme commands.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const apps = useAppStore((s) => s.apps);
  const setActiveApp = useAppStore((s) => s.setActiveApp);
  const toggleMode = useThemeStore((s) => s.toggleMode);

  // Listen for ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback(
    (appId: string) => {
      setActiveApp(appId);
      setOpen(false);
    },
    [setActiveApp],
  );

  const handleOpenThemePanel = useCallback(() => {
    setOpen(false);
    setThemePanelOpen(true);
  }, []);

  const handleToggleMode = useCallback(() => {
    toggleMode();
    setOpen(false);
  }, [toggleMode]);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Open App"
        description="Search and open an app"
        showCloseButton={false}
      >
        <CommandInput placeholder="Search apps…" />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Apps">
            {apps.map((app) => {
              const Icon = getAppIcon(app.icon);
              return (
                <CommandItem
                  key={app.id}
                  value={app.label}
                  onSelect={() => handleSelect(app.id)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{app.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="Theme">
            <CommandItem value="Open Theme Panel" onSelect={handleOpenThemePanel}>
              <span className="size-4 shrink-0 flex items-center justify-center">🎨</span>
              <span>Open Theme Panel</span>
            </CommandItem>
            <CommandItem value="Toggle Theme Mode" onSelect={handleToggleMode}>
              <span className="size-4 shrink-0 flex items-center justify-center">◑</span>
              <span>Toggle Light / Dark / System</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <ThemePanel open={themePanelOpen} onOpenChange={setThemePanelOpen} />
    </>
  );
}
