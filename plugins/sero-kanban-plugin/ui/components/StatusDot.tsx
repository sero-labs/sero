/**
 * StatusDot — visual indicator for card/subtask state.
 *
 * Follows ToolCallGroup.tsx status dot pattern: small colored circles
 * with pulse animation for active states.
 */

import type { CardStatus } from '../../shared/types';

export function CardStatusDot({ status }: { status: CardStatus }) {
  switch (status) {
    case 'agent-working':
      return <span className="size-2 shrink-0 animate-pulse rounded-full bg-blue-500" />;
    case 'waiting-input':
      return <span className="size-2 shrink-0 animate-pulse rounded-full bg-amber-500" />;
    case 'paused':
      return <span className="size-2 shrink-0 rounded-full bg-zinc-400" />;
    case 'failed':
      return <span className="size-2 shrink-0 rounded-full bg-red-500" />;
    case 'idle':
    default:
      return <span className="size-2 shrink-0 rounded-full bg-zinc-500" />;
  }
}

export function SubtaskStatusDot({ status }: { status: string }) {
  switch (status) {
    case 'in-progress':
      return <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500" />;
    case 'completed':
      return <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />;
    case 'failed':
      return <span className="size-1.5 shrink-0 rounded-full bg-red-500" />;
    case 'pending':
    default:
      return <span className="size-1.5 shrink-0 rounded-full bg-zinc-500" />;
  }
}
