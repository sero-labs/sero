/**
 * PriorityBadge — small pill showing card priority.
 */

import type { Priority } from '../../shared/types';

const PRIORITY_STYLES: Record<Priority, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/20',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  low: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none ${PRIORITY_STYLES[priority]}`}
    >
      {priority}
    </span>
  );
}
