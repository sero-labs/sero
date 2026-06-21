import type { LoopStatus, StepStatus } from '../../shared/types';

export const LOOP_STATUS_LABEL: Record<LoopStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  blocked: 'Blocked',
  complete: 'Complete',
  stopped: 'Stopped',
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
    case 'paused':
    case 'stopped':
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
