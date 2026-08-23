/**
 * The Orchestrator top bar (ux-refit-plan.md phase 3): brand mark, tab bar
 * with the emerald active underline, count badges, and the actions with
 * `+ New` as the one primary button.
 *
 * Width rules are container queries against the panel (`@container/panel`,
 * set on the app root): ≥900px full labels; below, tabs drop to icon + count
 * with the label in a tooltip, and the secondary actions collapse into one
 * overflow button. Nothing is removed.
 */

import type { ComponentType, ReactNode } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sero-ai/ui/components/ui/dropdown-menu';
import { cn } from '@sero-ai/ui/lib/utils';
import { BookOpen, Home, Library, MoreHorizontal, Plus, Users, Workflow } from 'lucide-react';
import { WORKFLOWS_LABEL } from '../../shared/labels';

export type ShellTab = 'home' | 'workflows' | 'rooms' | 'library' | 'catalog';

export interface ShellAction {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface ShellTopBarProps {
  active: ShellTab;
  workflowCount: number;
  roomCount: number;
  /** Items waiting on the user — renders the alert-toned badge on Home. */
  needsCount: number;
  onSelect: (tab: ShellTab) => void;
  onNew: () => void;
  /** Secondary actions; ghost buttons wide, one overflow menu narrow. */
  actions?: ShellAction[];
}

interface TabSpec {
  tab: ShellTab;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const TABS: TabSpec[] = [
  { tab: 'home', label: 'Home', icon: Home },
  { tab: 'workflows', label: WORKFLOWS_LABEL, icon: Workflow },
  { tab: 'rooms', label: 'Rooms', icon: Users },
  { tab: 'library', label: 'Library', icon: Library },
  { tab: 'catalog', label: 'Catalog', icon: BookOpen },
];

function TabBadge({ alert, children }: { alert?: boolean; active?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'room-tabular inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[10px] px-[5px] text-[10px] leading-none',
        alert
          ? 'bg-status-warning-subtle text-status-warning'
          : 'bg-room-muted text-room-text2 group-aria-[current=page]:bg-brand-primary-muted group-aria-[current=page]:text-brand-primary',
      )}
    >
      {children}
    </span>
  );
}

/** The 20px brand mark: two emerald diamonds in a bevelled square. */
function BrandMark() {
  return (
    <span
      aria-hidden
      className="relative size-5 shrink-0 rounded-[5px] border border-room-line-strong bg-linear-[145deg] from-room-overlay to-room-bg"
    >
      <span className="absolute top-[7px] left-1 size-1 rotate-45 border border-brand-primary" />
      <span className="absolute top-[7px] right-1 size-1 rotate-45 border border-brand-primary" />
    </span>
  );
}

export function ShellTopBar({ active, workflowCount, roomCount, needsCount, onSelect, onNew, actions = [] }: ShellTopBarProps) {
  const badgeFor = (tab: ShellTab): ReactNode => {
    if (tab === 'home' && needsCount > 0) return <TabBadge alert>{needsCount}</TabBadge>;
    if (tab === 'workflows' && workflowCount > 0) return <TabBadge>{workflowCount}</TabBadge>;
    if (tab === 'rooms' && roomCount > 0) return <TabBadge>{roomCount}</TabBadge>;
    return null;
  };

  return (
    <header className="flex h-14 shrink-0 items-center border-b border-room-line bg-room-bg px-4 text-room-text">
      <div className="mr-3 flex items-center gap-[9px] text-[13px] font-semibold @min-[900px]/panel:mr-0 @min-[900px]/panel:w-[186px]">
        <BrandMark />
        <span className="hidden @min-[900px]/panel:inline">Orchestrator</span>
      </div>
      <nav className="flex h-full items-center gap-1 self-stretch">
        {TABS.map(({ tab, label, icon: Icon }) => (
          <button
            key={tab}
            type="button"
            aria-current={tab === active ? 'page' : undefined}
            title={label}
            onClick={() => onSelect(tab)}
            className={cn(
              'group relative flex h-full items-center gap-[7px] px-3 text-[13px] @min-[900px]/panel:px-4',
              tab === active ? 'text-room-text' : 'text-room-text3',
            )}
          >
            <Icon className="size-4 @min-[900px]/panel:hidden" />
            <span className="hidden @min-[900px]/panel:inline">{label}</span>
            {badgeFor(tab)}
            {tab === active && <span className="absolute inset-x-3.5 -bottom-px h-0.5 bg-brand-primary" />}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {actions.length > 0 && (
          <>
            <span className="hidden @min-[900px]/panel:flex @min-[900px]/panel:items-center @min-[900px]/panel:gap-2">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant="ghost"
                  className="text-xs font-normal text-room-text3"
                  disabled={action.disabled}
                  onClick={action.onSelect}
                >
                  {action.label}
                </Button>
              ))}
            </span>
            <span className="@min-[900px]/panel:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-sm" variant="ghost" title="More actions">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {actions.map((action) => (
                    <DropdownMenuItem key={action.label} disabled={action.disabled} onSelect={action.onSelect}>
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </>
        )}
        <Button size="sm" onClick={onNew}>
          <Plus className="size-3.5" /> New
        </Button>
      </div>
    </header>
  );
}
