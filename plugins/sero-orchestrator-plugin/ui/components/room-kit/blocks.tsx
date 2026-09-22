/**
 * room-kit/blocks — the composed devices: EventCard, AuthorityBand,
 * ModeCard, NeedsBand (ux-refit-plan.md §4).
 */

import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { StatusDot, type MemberStatus } from './identity';

export type EventCardTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'revision';

const EVENT_TONES: Record<EventCardTone, string> = {
  neutral: 'border-room-line bg-room-surface',
  ok: 'border-brand-primary-border bg-brand-primary-faint',
  warn: 'border-status-warning-border bg-status-warning-muted',
  bad: 'border-status-error-border bg-status-error-muted',
  revision: 'border-collab-primary-border bg-collab-primary-muted',
};

export interface EventCardProps {
  tone?: EventCardTone;
  title: ReactNode;
  /** Right-aligned pill in the header row. */
  pill?: ReactNode;
  /** Action buttons under the body. */
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** A promoted timeline event: finding, question, revision, approval. */
export function EventCard({ tone = 'neutral', title, pill, actions, className, children }: EventCardProps) {
  return (
    <div className={cn('rounded-lg border px-3 py-[11px]', EVENT_TONES[tone], className)}>
      <div className="flex items-center gap-2 text-[11px] font-semibold text-room-text2">
        {title}
        {pill != null && <span className="ml-auto shrink-0">{pill}</span>}
      </div>
      {children != null && <div className="mt-[7px] text-[11px] leading-relaxed text-room-text4">{children}</div>}
      {actions != null && <div className="mt-2.5 flex gap-[7px]">{actions}</div>}
    </div>
  );
}

export interface AuthorityCell {
  label: string;
  value: ReactNode;
  /** Small line under the value — `hard stop`, `then it pauses for you`. */
  sub?: ReactNode;
  /** Struck-through previous value: the `changed` variant of a cell. */
  was?: ReactNode;
}

export interface AuthorityBandProps {
  title: ReactNode;
  /** Right-aligned hint — `computed from the plan the team will run under`. */
  hint?: ReactNode;
  cells: AuthorityCell[];
  /** The kept/removed sentence under a hairline (Adjust). */
  footer?: ReactNode;
  /** brand = the emerald consent band · neutral = the recompute panel. */
  tone?: 'brand' | 'neutral';
  className?: string;
}

/** The four-cell computed band — the consent surface. Figures never truncate. */
export function AuthorityBand({ title, hint, cells, footer, tone = 'brand', className }: AuthorityBandProps) {
  const brand = tone === 'brand';
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        brand
          ? 'border-brand-primary-border bg-linear-[160deg] from-brand-primary-faint to-transparent'
          : 'border-room-line bg-room-surface',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold',
          brand ? 'border-brand-primary-subtle text-room-ink-brand' : 'border-room-line text-room-text2',
        )}
      >
        {title}
        {hint != null && <span className="ml-auto text-xs font-normal text-room-text4">{hint}</span>}
      </div>
      {/* The emerald band separates cells with hairlines; the neutral
          recompute panel uses plain gaps (prototype .auth-grid vs .diff).
          Cells go 4 → 2 → 1 with the panel (ux-refit-plan.md phase 7) and
          never truncate a figure — the numbers are what is consented to. */}
      <div
        className={cn(
          'grid @min-[600px]/panel:grid-cols-2 @min-[900px]/panel:grid-cols-4',
          !brand && 'gap-2.5 px-4 py-3',
        )}
      >
        {cells.map((cell) => (
          <div
            key={cell.label}
            className={cn(
              brand
                && 'border-brand-primary-muted px-4 py-3 not-last:border-b @min-[600px]/panel:nth-[odd]:border-r @min-[600px]/panel:nth-[3]:border-b-0 @min-[900px]/panel:not-last:border-r @min-[900px]/panel:border-b-0',
            )}
          >
            <span className="font-mono text-xs block uppercase tracking-[0.08em] text-room-text4">{cell.label}</span>
            <span
              className={cn(
                'mt-1.5 block text-lg font-medium tracking-[-0.02em]',
                cell.was != null ? 'text-brand-primary' : 'text-room-text',
              )}
            >
              {cell.value}
            </span>
            {cell.was != null && (
              <span className="mt-1 block text-xs text-room-text4 line-through">{cell.was}</span>
            )}
            {cell.sub != null && <span className="mt-1 block text-xs text-room-text4">{cell.sub}</span>}
          </div>
        ))}
      </div>
      {footer != null && (
        <div
          className={cn(
            'border-t px-4 py-2.5 text-sm leading-relaxed text-room-text4',
            brand ? 'border-brand-primary-subtle' : 'border-room-line',
          )}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

export interface ModeCardProps extends Omit<ComponentProps<'button'>, 'title'> {
  glyph: ReactNode;
  title: ReactNode;
  /** Pill beside the title — `New`. */
  badge?: ReactNode;
  /** Meta pills under the description. */
  meta?: ReactNode;
  /** The highlighted mode with the emerald wash. */
  on?: boolean;
}

/** The Workflow/Room chooser card on Home. */
export function ModeCard({ glyph, title, badge, meta, on = false, className, children, ...props }: ModeCardProps) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={on}
      className={cn(
        'relative overflow-hidden rounded-[10px] border p-[18px] text-left',
        on
          ? 'border-brand-primary-border bg-linear-[160deg] from-brand-primary-faint to-room-surface'
          : 'border-room-line bg-room-surface',
        className,
      )}
    >
      <span className="flex items-center gap-[9px] text-[15px] font-semibold tracking-[-0.02em] text-room-text">
        <span
          className={cn(
            'grid size-[26px] shrink-0 place-items-center rounded-[7px] text-[13px]',
            on ? 'bg-brand-primary-muted text-brand-primary' : 'bg-room-muted text-room-text2',
          )}
        >
          {glyph}
        </span>
        {title}
        {badge}
      </span>
      <span className="mt-2 block max-w-[440px] text-xs leading-normal text-room-text3">{children}</span>
      {meta != null && <span className="mt-3.5 flex gap-[7px]">{meta}</span>}
    </button>
  );
}

export interface NeedsBandProps {
  title?: ReactNode;
  /** Right-aligned count — `3 items`. */
  count?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * The "Needs you" section: a quiet mono heading over a plain card.
 *
 * It used to be an amber band with a warning glyph. The approved proposal draws
 * it plain, because every row inside already names what is being asked and the
 * amber is spent on the ask itself, not on the container.
 */
export function NeedsBand({ title = 'Needs you', count, className, children }: NeedsBandProps) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-baseline gap-2.5 font-mono text-[10px] tracking-[0.08em] text-room-text3 uppercase">
        {title}
        {count != null && <span className="room-tabular ml-auto text-room-text4">{count}</span>}
      </div>
      <div className="rounded-[10px] border border-room-line bg-room-surface px-[17px] py-[15px]">{children}</div>
    </section>
  );
}

export interface NeedsRowProps {
  /** Dimmed trailing source — `Room · Auth hardening · Conductor`. */
  source?: ReactNode;
  /** Right-aligned action button. */
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** One item in the Needs you card: a divided row, the action on the right. */
export function NeedsRow({ source, action, className, children }: NeedsRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-[9px] border-b border-room-line py-1.5 text-xs text-room-text2 last:border-b-0',
        className,
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {children}
        {/* An empty source used to print a separator with nothing after it. */}
        {source != null && source !== '' && <span className="ml-1 text-[11px] text-room-text3">· {source}</span>}
      </span>
      {action != null && <span className="shrink-0">{action}</span>}
    </div>
  );
}
