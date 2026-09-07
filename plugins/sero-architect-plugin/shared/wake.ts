/**
 * Wake events: the only reasons the owner session is ever prompted. Six
 * sources in a fixed priority order, delivered one at a time per project, and
 * wakes of the same kind that queue up during a turn become one wake.
 */

export const WAKE_KINDS = [
  'directive',
  'decision',
  'dispatch-blocked',
  'dispatch-complete',
  'external-event',
  'quiet',
] as const;

export type WakeKind = (typeof WAKE_KINDS)[number];

export interface WakeEvent {
  kind: WakeKind;
  at: string;
  /** Plain-English lines naming what happened, one per coalesced event. */
  items: string[];
}

/** Lower is sooner. */
export function wakePriority(kind: WakeKind): number {
  return WAKE_KINDS.indexOf(kind);
}

/** Adds a wake to the queue, merging it into a queued wake of the same kind. */
export function enqueueWake(queue: readonly WakeEvent[], incoming: WakeEvent): WakeEvent[] {
  const existing = queue.find((wake) => wake.kind === incoming.kind);
  if (!existing) return [...queue, incoming];
  const merged: WakeEvent = {
    kind: existing.kind,
    at: existing.at,
    items: [...existing.items, ...incoming.items.filter((item) => !existing.items.includes(item))],
  };
  return queue.map((wake) => (wake === existing ? merged : wake));
}

/** The wake to deliver next: highest priority, then oldest. */
export function nextWake(queue: readonly WakeEvent[]): WakeEvent | null {
  if (queue.length === 0) return null;
  return [...queue].sort((a, b) => wakePriority(a.kind) - wakePriority(b.kind) || a.at.localeCompare(b.at))[0] ?? null;
}

export function describeWake(wake: WakeEvent): string {
  const labels: Record<WakeKind, string> = {
    directive: 'the user sent a directive',
    decision: 'the user answered',
    'dispatch-blocked': 'dispatched work is blocked or asked a question',
    'dispatch-complete': 'dispatched work reported completion',
    'external-event': 'an event arrived through a maintenance Workflow',
    quiet: 'the project is quiet and work remains',
  };
  return labels[wake.kind];
}
