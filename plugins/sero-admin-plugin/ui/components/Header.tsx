/**
 * Header — title bar with profile indicator.
 * Wrapped in React.memo — props are stable.
 */

import { memo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import type { AdminSection } from '../../shared/types';

interface HeaderProps {
  profileName: string | null;
  activeSection: AdminSection;
}

const SECTION_LABELS: Record<AdminSection, string> = {
  agents: 'Agents',
  skills: 'Skills',
  prompts: 'Prompts',
  settings: 'Configuration',
  modelDefaults: 'Providers',
  plugins: 'Plugins',
  logs: 'Logs',
  sessions: 'Sessions',
};

export const Header = memo(function Header({ profileName, activeSection }: HeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-foreground">Admin</h1>
          <span className="text-xs text-muted-foreground/50">·</span>
          <span className="text-xs text-muted-foreground/70">{SECTION_LABELS[activeSection]}</span>
        </div>
      </div>
      {profileName && (
        <Badge
          variant="outline"
          className={cn(
            'h-5 rounded-md border-primary/20 px-2 text-[10px] font-medium',
            'bg-primary/5 text-primary',
          )}
        >
          {profileName}
        </Badge>
      )}
    </div>
  );
});
