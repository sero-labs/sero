/**
 * The single source for the wireframe's state visual language (see
 * specs/09-ui-redesign.md). State is the most-repeated signal in the product, so
 * loop status, the 8 step statuses, and the needs-you signals all resolve their
 * label + colours here. Every surface (home inbox, list, detail header, plan)
 * imports from this one map so a status looks identical everywhere.
 *
 * Accents follow the wireframe: green = active/done/running, amber = needs-you /
 * blocked-attention, blue = complete / suggestions, neutral = draft/disabled/idle.
 */

import type { LoopStatus, StepStatus } from '../../shared/types';

export interface StatusStyle {
  label: string;
  /** A small filled dot for compact rows (bg-* class). */
  dot: string;
  /** Outline chip classes — border + text + faint fill. */
  badge: string;
  /** Optional subtle card tint, '' for neutral. */
  tint: string;
}

export const LOOP_STATUS_STYLE: Record<LoopStatus, StatusStyle> = {
  draft: {
    label: 'Draft',
    dot: 'bg-muted-foreground/50',
    badge: 'border-border text-muted-foreground',
    tint: '',
  },
  active: {
    label: 'Active',
    dot: 'bg-emerald-500',
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
    tint: '',
  },
  blocked: {
    label: 'Blocked',
    dot: 'bg-amber-500',
    badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
    tint: 'border-amber-500/30 bg-amber-500/5',
  },
  complete: {
    label: 'Complete',
    dot: 'bg-sky-500',
    badge: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
    tint: '',
  },
  disabled: {
    label: 'Disabled',
    dot: 'bg-muted-foreground/40',
    badge: 'border-border text-muted-foreground/70',
    tint: '',
  },
};

/**
 * The 8 wireframe step statuses. The data model uses `succeeded`/`needs-revision`;
 * we present them as the wireframe's `done`/`recovering` labels.
 */
export const STEP_STATUS_STYLE: Record<StepStatus, StatusStyle> = {
  pending: { label: 'pending', dot: 'bg-muted-foreground/40', badge: 'border-border text-muted-foreground', tint: '' },
  ready: { label: 'ready', dot: 'bg-emerald-500/60', badge: 'border-emerald-500/30 text-emerald-400/90', tint: '' },
  running: { label: 'running', dot: 'bg-emerald-500', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', tint: 'border-emerald-500/30 bg-emerald-500/5' },
  succeeded: { label: 'done', dot: 'bg-emerald-500', badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400', tint: '' },
  blocked: { label: 'blocked', dot: 'bg-amber-500', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', tint: 'border-amber-500/30 bg-amber-500/5' },
  failed: { label: 'failed', dot: 'bg-rose-500', badge: 'border-rose-500/40 bg-rose-500/10 text-rose-400', tint: 'border-rose-500/30 bg-rose-500/5' },
  'needs-revision': { label: 'recovering', dot: 'bg-amber-500', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', tint: 'border-amber-500/30 bg-amber-500/5' },
  skipped: { label: 'skipped', dot: 'bg-muted-foreground/30', badge: 'border-border text-muted-foreground/60', tint: '' },
};

/** Needs-you signals are independent of status (wireframe: `?N` and `✦N`). */
export const NEEDS_YOU_STYLE = {
  input: { glyph: '?', badge: 'border-amber-500/40 bg-amber-500/10 text-amber-400', dot: 'bg-amber-500' },
  suggestions: { glyph: '✦', badge: 'border-sky-500/40 bg-sky-500/10 text-sky-400', dot: 'bg-sky-500' },
} as const;
