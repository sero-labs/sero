/**
 * room-kit/chrome — the small recurring devices: Eyebrow, Pill, SectionHead,
 * Meter, NoteBlock (ux-refit-plan.md §4).
 */

import type { ReactNode } from 'react';
import { Badge } from '@sero-ai/ui';
import { cn } from '@sero-ai/ui/lib/utils';

/** The kit's accent vocabulary, named for meaning, not colour (D1). */
export type AccentTone = 'neutral' | 'brand' | 'collab' | 'warn' | 'error' | 'info';

const EYEBROW_TONES: Record<AccentTone, string> = {
  neutral: 'text-room-text3',
  brand: 'text-brand-primary',
  collab: 'text-collab-primary',
  warn: 'text-status-warning',
  error: 'text-status-error',
  info: 'text-status-info',
};

export interface EyebrowProps {
  tone?: AccentTone;
  className?: string;
  children: ReactNode;
}

/** The mono, uppercase, letter-spaced micro label above a block. */
export function Eyebrow({ tone = 'neutral', className, children }: EyebrowProps) {
  return (
    <div className={cn('room-mono-micro uppercase tracking-[0.12em]', EYEBROW_TONES[tone], className)}>
      {children}
    </div>
  );
}

const PILL_TONES: Record<AccentTone, string> = {
  neutral: 'border-room-line bg-room-raised text-room-text3',
  brand: 'border-brand-primary-border bg-brand-primary-muted text-room-ink-brand',
  collab: 'border-collab-primary-border bg-collab-primary-muted text-room-ink-collab',
  warn: 'border-status-warning-border bg-status-warning-muted text-room-ink-warn',
  error: 'border-status-error-border bg-status-error-muted text-room-ink-error',
  info: 'border-status-info-border bg-status-info-muted text-room-ink-info',
};

export interface PillProps {
  tone?: AccentTone;
  className?: string;
  children: ReactNode;
}

/** The 21px tinted pill. Wraps the shared Badge. */
export function Pill({ tone = 'neutral', className, children }: PillProps) {
  return (
    <Badge
      variant="outline"
      className={cn('h-[21px] gap-1.5 rounded-[11px] px-2 text-[10px] font-normal', PILL_TONES[tone], className)}
    >
      {children}
    </Badge>
  );
}

export interface SectionHeadProps {
  /** Right-aligned count or meta, set in the mono micro face. */
  count?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** `ROOMS ————————— 2` — the rule-and-count list header. */
export function SectionHead({ count, className, children }: SectionHeadProps) {
  return (
    <div
      className={cn(
        'mb-2 flex h-7 items-center text-[11px] font-semibold tracking-[0.06em] uppercase text-room-text3',
        className,
      )}
    >
      {children}
      <span className="mx-3 h-px flex-1 bg-room-line" />
      {count != null && <span className="room-mono-micro tracking-normal normal-case">{count}</span>}
    </div>
  );
}

export interface MeterProps {
  /** The moving figure — `41m`, `$3.18`. */
  value: ReactNode;
  /** The limit — `2h`, `$6.00`. Rendered as “of X”. */
  of?: ReactNode;
  /** 0–100. */
  pct: number;
  /** Defaults to pct ≥ 90. */
  warn?: boolean;
  className?: string;
}

/** Figure + 64px track + “of X”. Amber when close to the limit. */
export function Meter({ value, of, pct, warn, className }: MeterProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const isWarn = warn ?? clamped >= 90;
  return (
    <span className={cn('room-tabular flex shrink-0 items-center gap-2 text-[10px] text-room-text3', className)}>
      {value}
      <span className="h-[3px] w-16 overflow-hidden rounded-[2px] bg-room-muted">
        <span
          className={cn('block h-full', isWarn ? 'bg-status-warning' : 'bg-brand-primary')}
          style={{ width: `${clamped}%` }}
        />
      </span>
      {of != null && <span>of {of}</span>}
    </span>
  );
}

const NOTE_TONES: Record<
  'collab' | 'brand' | 'info',
  { container: string; eyebrow: AccentTone; body: string }
> = {
  collab: {
    container: 'border-room-line border-l-2 border-l-collab-primary bg-collab-primary-muted rounded-r-[7px]',
    eyebrow: 'collab',
    // The prototype's planner note dims its violet (#a99ad0, not #bda8f5).
    body: 'text-room-ink-collab opacity-80',
  },
  brand: {
    container: 'border-room-line border-l-2 border-l-brand-primary bg-brand-primary-faint rounded-r-[7px]',
    eyebrow: 'brand',
    body: 'text-room-text3',
  },
  info: {
    container: 'border-room-line border-l-2 border-l-status-info bg-status-info-muted rounded-r-[7px]',
    eyebrow: 'info',
    body: 'text-room-ink-info',
  },
};

export interface NoteBlockProps {
  /** collab = planner note · brand = Conductor's note · info = session notice */
  tone?: 'collab' | 'brand' | 'info';
  title?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** The left-ruled accented note. */
export function NoteBlock({ tone = 'brand', title, className, children }: NoteBlockProps) {
  const styles = NOTE_TONES[tone];
  return (
    <div className={cn('border px-3 py-2.5', styles.container, className)}>
      {title != null && (
        <Eyebrow tone={styles.eyebrow} className="mb-1.5">
          {title}
        </Eyebrow>
      )}
      <div className={cn('text-[11px] leading-relaxed', styles.body)}>{children}</div>
    </div>
  );
}
