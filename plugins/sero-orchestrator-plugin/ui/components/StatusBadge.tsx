import { Badge } from '@sero-ai/ui';

import type { LoopStatus } from '../../shared/types';
import '../styles.css';

const STATUS_LABEL: Record<LoopStatus, string> = {
  draft: 'Draft',
  active: 'Running',
  paused: 'Paused',
  blocked: 'Blocked',
  complete: 'Done',
  stopped: 'Stopped',
};

// Semantic theme colors keep the badge readable across light/dark themes.
const STATUS_CLASS: Record<LoopStatus, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  active: 'bg-primary text-primary-foreground',
  paused: 'bg-secondary text-secondary-foreground',
  blocked: 'bg-destructive text-destructive-foreground',
  complete: 'bg-primary/15 text-primary',
  stopped: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status }: { status: LoopStatus }) {
  return (
    <Badge className={`${STATUS_CLASS[status]} border-transparent`}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export default StatusBadge;
