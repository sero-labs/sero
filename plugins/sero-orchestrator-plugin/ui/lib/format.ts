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

/** Compact human duration: "820 ms", "4.2s", "1m 20s", "2h 5m". */
export function formatDuration(ms?: number): string {
  if (ms === undefined || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) {
    const rem = Math.round(seconds % 60);
    return rem ? `${totalMinutes}m ${rem}s` : `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

/** USD with cents, extending to 4 dp for sub-cent amounts. */
export function formatCost(usd?: number): string {
  if (usd === undefined) return '—';
  return usd.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: usd < 0.1 ? 4 : 2,
  });
}
