/**
 * NavSidebar — vertical nav with grouped sections for the Admin app.
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AdminSection } from '../../shared/types';

interface NavSidebarProps {
  active: AdminSection;
  onSelect: (section: AdminSection) => void;
}

interface NavItem {
  id: AdminSection;
  label: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Resources',
    items: [
      { id: 'agents', label: 'Agents' },
      { id: 'skills', label: 'Skills' },
      { id: 'prompts', label: 'Prompts' },
    ],
  },
  {
    title: 'Config',
    items: [
      { id: 'settings', label: 'Settings' },
      { id: 'model', label: 'Model' },
      { id: 'plugins', label: 'Plugins' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'logs', label: 'Logs' },
      { id: 'sessions', label: 'Sessions' },
    ],
  },
];

export const NavSidebar = memo(function NavSidebar({ active, onSelect }: NavSidebarProps) {
  return (
    <nav className="flex w-[160px] shrink-0 flex-col border-r border-border/30 bg-background">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--accent-code)]">
            {group.title}
          </p>
          {group.items.map((item) => (
            <button type="button"
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={cn(
                'admin-nav-item flex w-full items-center px-3 py-1.5 text-xs transition-colors duration-150',
                'hover:bg-secondary/50 hover:text-foreground',
                active === item.id
                  ? 'border-l-2 border-l-primary bg-secondary text-foreground font-medium'
                  : 'border-l-2 border-l-transparent text-muted-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
});
