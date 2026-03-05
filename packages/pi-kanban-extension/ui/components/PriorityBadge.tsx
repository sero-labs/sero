/**
 * PriorityBadge — small pill showing card priority.
 */

import type { Priority } from '../../shared/types';

const PRIORITY_STYLES: Record<Priority, string> = {
  critical: 'bg-red-500/15 text-red-400',
  high: 'bg-amber-500/15 text-amber-400',
  medium: 'bg-blue-500/15 text-blue-400',
  low: 'bg-zinc-500/15 text-zinc-400',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}
