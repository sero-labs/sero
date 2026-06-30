/**
 * Shared status chips for the wireframe state language (see specs/09-ui-redesign.md).
 * All colours come from ui/lib/status-style.ts so a status renders identically in
 * the home inbox, the loop list, the detail header, and the plan.
 */

import { Badge } from '@sero-ai/ui';
import type { LoopStatus, StepStatus } from '../../shared/types';
import { LOOP_STATUS_STYLE, NEEDS_YOU_STYLE, STEP_STATUS_STYLE } from '../lib/status-style';

export function LoopStatusBadge({ status, className = '' }: { status: LoopStatus; className?: string }) {
  const s = LOOP_STATUS_STYLE[status];
  return <Badge variant="outline" className={`${s.badge} ${className}`}>{s.label}</Badge>;
}

/** A bare status dot for compact rows (loop list, overview cards). */
export function StatusDot({ status, className = '' }: { status: LoopStatus; className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${LOOP_STATUS_STYLE[status].dot} ${className}`} aria-hidden />;
}

export function StepStatusPill({ status, className = '' }: { status: StepStatus; className?: string }) {
  const s = STEP_STATUS_STYLE[status];
  return <Badge variant="outline" className={`${s.badge} ${className}`}>{s.label}</Badge>;
}

/**
 * The needs-you count badge: `?N` for pending input, `✦N` for pending suggestions.
 * Independent of loop status (a complete loop can still have suggestions).
 */
export function NeedsYouBadge({ kind, count, className = '' }: { kind: 'input' | 'suggestions'; count: number; className?: string }) {
  if (count <= 0) return null;
  const s = NEEDS_YOU_STYLE[kind];
  const title = kind === 'input' ? `${count} question(s) waiting for your answer` : `${count} suggestion(s) to review`;
  return (
    <span
      title={title}
      className={`inline-flex h-4 min-w-4 items-center justify-center gap-0.5 rounded-full border px-1 text-[10px] font-semibold ${s.badge} ${className}`}
    >
      <span aria-hidden>{s.glyph}</span>
      {count}
    </span>
  );
}
