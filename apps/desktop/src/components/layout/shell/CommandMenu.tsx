import { useCallback, useEffect, useState } from 'react';
import { Monitor, Palette, Pencil, Smartphone, Star, Stethoscope } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@sero-ai/ui/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { useAppStore } from '@/stores/app';
import { isChromeShortcutsFull } from '@/stores/app/shared';
import { useThemeStore } from '@/stores/theme';
import { getAppIcon } from '@/lib/app-icons';
import { openApp } from '@/lib/open-app';
import { ThemePanel } from '@/components/layout/theme/ThemePanel';
import { ThemeEditorSheet } from '@/components/layout/theme/ThemeEditorSheet';
import { ConnectDeviceDialog } from '@/components/layout/device/ConnectDeviceDialog';
import { DoctorPanel } from '@/components/diagnostics/DoctorPanel';

/**
 * CommandMenu, ⌘K command palette for quick app switching.
 *
 * Lists all registered apps (built-in + discovered) and switches
 * to the selected app on selection. Also provides theme commands.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editPresetId, setEditPresetId] = useState<string | null>(null);
  const [connectDeviceOpen, setConnectDeviceOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const apps = useAppStore((s) => s.apps);
  const activeApp = useAppStore((s) => s.activeApp);
  const activePinned = useAppStore((s) => s.isChromeShortcut(s.activeApp));
  const shortcutsFull = useAppStore((s) => isChromeShortcutsFull(s.chromeShortcuts, s.apps));
  const toggleChromeShortcut = useAppStore((s) => s.toggleChromeShortcut);
  const toggleMode = useThemeStore((s) => s.toggleMode);
  const activePresetId = useThemeStore((s) => s.activePresetId);

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

  const handleSelect = useCallback((appId: string) => {
    openApp(appId);
    setOpen(false);
  }, []);

  const handleOpenThemePanel = useCallback(() => {
    setOpen(false);
    setThemePanelOpen(true);
  }, []);

  const handleToggleMode = useCallback(() => {
    toggleMode();
    setOpen(false);
  }, [toggleMode]);

  const handleEditCurrent = useCallback(() => {
    setOpen(false);
    setEditPresetId(activePresetId);
    setEditorOpen(true);
  }, [activePresetId]);

  const handleConnectDevice = useCallback(() => {
    setOpen(false);
    setConnectDeviceOpen(true);
  }, []);

  const handleOpenDoctor = useCallback(() => {
    setOpen(false);
    setDoctorOpen(true);
  }, []);

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Open App"
        description="Search and open an app"
        showCloseButton={false}
      >
        <CommandInput placeholder="Search apps..." />
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
            <CommandItem
              value="Pin Unpin Current App Shortcut"
              disabled={!activePinned && shortcutsFull}
              onSelect={() => {
                toggleChromeShortcut(activeApp);
                setOpen(false);
              }}
            >
              <Star className="size-4 shrink-0" />
              <span>
                {activePinned
                  ? 'Unpin Current App from Shortcuts'
                  : shortcutsFull
                    ? 'Pin Current App (shortcuts full)'
                    : 'Pin Current App to Shortcuts'}
              </span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Diagnostics">
            <CommandItem value="Environment Doctor Diagnostics" onSelect={handleOpenDoctor}>
              <Stethoscope className="size-4 shrink-0" />
              <span>Environment Doctor</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Remote">
            <CommandItem value="Connect Device" onSelect={handleConnectDevice}>
              <Smartphone className="size-4 shrink-0" />
              <span>Connect Device</span>
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Theme">
            <CommandItem value="Browse Themes" onSelect={handleOpenThemePanel}>
              <Palette className="size-4 shrink-0" />
              <span>Browse Themes</span>
            </CommandItem>
            <CommandItem value="Edit Current Theme" onSelect={handleEditCurrent}>
              <Pencil className="size-4 shrink-0" />
              <span>Edit Current Theme</span>
            </CommandItem>
            <CommandItem value="Toggle Theme Mode" onSelect={handleToggleMode}>
              <Monitor className="size-4 shrink-0" />
              <span>Toggle Light / Dark / System</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <ThemePanel open={themePanelOpen} onOpenChange={setThemePanelOpen} />
      <ThemeEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editPresetId={editPresetId}
      />
      <ConnectDeviceDialog
        open={connectDeviceOpen}
        onOpenChange={setConnectDeviceOpen}
      />
      <Dialog open={doctorOpen} onOpenChange={setDoctorOpen}>
        <DialogContent className="flex h-[min(88vh,52rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12">
            <DialogTitle>Environment Doctor</DialogTitle>
            <DialogDescription>
              Run diagnostics for Sero, profiles, providers, plugins, and runtime setup.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            <DoctorPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
