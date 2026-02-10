import React, { useCallback, useEffect, useState } from 'react';
import {
  PlusIcon,
  TerminalIcon,
  GlobeIcon,
  BotIcon,
  PuzzleIcon,
  PackageIcon,
  SettingsIcon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from './ui/command';
import { Kbd } from './ui/kbd';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewProject: () => void;
  onOpenSkills?: () => void;
  onOpenPackages?: () => void;
  onOpenSettings?: () => void;
}

interface SeroCommand {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: React.ReactNode;
  action: () => void;
}

export function CommandBar({ open, onOpenChange, onNewProject, onOpenSkills, onOpenPackages, onOpenSettings }: Props) {
  const commands: SeroCommand[] = [
    {
      id: 'new-project',
      label: 'New Project',
      icon: <PlusIcon />,
      shortcut: <><Kbd>⌘</Kbd><Kbd>N</Kbd></>,
      action: () => { onNewProject(); onOpenChange(false); },
    },
    {
      id: 'new-terminal',
      label: 'New Terminal',
      icon: <TerminalIcon />,
      shortcut: <><Kbd>⌘</Kbd><Kbd>T</Kbd></>,
      action: () => { /* TODO */ onOpenChange(false); },
    },
    {
      id: 'new-agent',
      label: 'New Agent Chat',
      icon: <BotIcon />,
      action: () => { /* TODO */ onOpenChange(false); },
    },
    {
      id: 'toggle-preview',
      label: 'Toggle Preview',
      icon: <GlobeIcon />,
      action: () => { /* TODO */ onOpenChange(false); },
    },
    {
      id: 'open-skills',
      label: 'Skills',
      icon: <PuzzleIcon />,
      shortcut: <><Kbd>⌘</Kbd><Kbd>⇧</Kbd><Kbd>S</Kbd></>,
      action: () => { onOpenSkills?.(); onOpenChange(false); },
    },
    {
      id: 'open-packages',
      label: 'Packages',
      icon: <PackageIcon />,
      action: () => { onOpenPackages?.(); onOpenChange(false); },
    },
    {
      id: 'open-settings',
      label: 'Settings',
      icon: <SettingsIcon />,
      shortcut: <><Kbd>⌘</Kbd><Kbd>,</Kbd></>,
      action: () => { onOpenSettings?.(); onOpenChange(false); },
    },
  ];

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search for a command to run"
    >
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No matching commands</CommandEmpty>
        <CommandGroup heading="Actions">
          {commands.map((cmd) => (
            <CommandItem key={cmd.id} onSelect={cmd.action} className="gap-3">
              {cmd.icon}
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <CommandShortcut className="flex items-center gap-0.5">
                  {cmd.shortcut}
                </CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
