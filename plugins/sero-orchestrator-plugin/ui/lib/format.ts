import type { LoopStatus, StepStatus } from '../../shared/types';

export const LOOP_STATUS_LABEL: Record<LoopStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  blocked: 'Blocked',
  complete: 'Complete',
  disabled: 'Disabled',
};

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export function loopStatusVariant(status: LoopStatus): BadgeVariant {
  switch (status) {
    case 'active':
      return 'default';
    case 'complete':
      return 'secondary';
    case 'blocked':
      return 'destructive';
    case 'draft':
    case 'disabled':
      return 'outline';
  }
}

export function stepStatusVariant(status: StepStatus): BadgeVariant {
  switch (status) {
    case 'running':
    case 'ready':
      return 'default';
    case 'succeeded':
      return 'secondary';
    case 'failed':
    case 'blocked':
      return 'destructive';
    default:
      return 'outline';
  }
}

export function formatTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
