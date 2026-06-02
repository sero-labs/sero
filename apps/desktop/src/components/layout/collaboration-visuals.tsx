import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Lightbulb,
  Search,
  Users,
} from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CollaborationRole } from '@/types/collaboration';

interface CollaborationRoleVisual {
  label: string;
  icon: LucideIcon;
  color: string;
  surface: string;
  border: string;
  statusVerb: string;
  lane: 'left' | 'right';
}

export const COLLABORATION_ROLE_VISUALS: Record<
  CollaborationRole,
  CollaborationRoleVisual
> = {
  coordinator: {
    label: 'Coordinator',
    icon: Users,
    color: 'text-[var(--collab-primary)]',
    surface: 'bg-[var(--collab-primary-subtle)]',
    border: 'border-[var(--collab-primary-border)]',
    statusVerb: 'Orchestrating',
    lane: 'right',
  },
  researcher: {
    label: 'Researcher',
    icon: Search,
    color: 'text-status-info',
    surface: 'bg-status-info-subtle',
    border: 'border-status-info-border',
    statusVerb: 'Investigating',
    lane: 'left',
  },
  analyst: {
    label: 'Analyst',
    icon: BarChart3,
    color: 'text-status-success',
    surface: 'bg-status-success-subtle',
    border: 'border-status-success-border',
    statusVerb: 'Crunching data',
    lane: 'right',
  },
  visionary: {
    label: 'Visionary',
    icon: Lightbulb,
    color: 'text-status-warning',
    surface: 'bg-status-warning-subtle',
    border: 'border-status-warning-border',
    statusVerb: 'Brainstorming',
    lane: 'left',
  },
};

interface CollaborationRoleBadgeProps {
  role: CollaborationRole;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

export function CollaborationRoleBadge({
  role,
  size = 'md',
  pulse = false,
}: CollaborationRoleBadgeProps) {
  const visual = COLLABORATION_ROLE_VISUALS[role];
  const Icon = visual.icon;
  const sizeClass =
    size === 'sm'
      ? 'size-5 rounded-md [&_svg]:size-2.5'
      : 'size-7 rounded-lg [&_svg]:size-3.5';

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center border shadow-sm',
        sizeClass,
        visual.surface,
        visual.border,
        visual.color,
      )}
      aria-label={visual.label}
      title={visual.label}
    >
      <Icon strokeWidth={2.1} />
      {pulse && (
        <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[var(--bg-surface)] bg-status-success animate-pulse" />
      )}
    </div>
  );
}
