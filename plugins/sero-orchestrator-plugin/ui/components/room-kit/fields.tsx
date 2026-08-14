/**
 * room-kit/fields — the blueprint form language of Advanced settings
 * (ux-refit-plan.md §4). Read-only per decision D6: these render evidence,
 * not controls — nothing here takes a click. Adjust is the only write path.
 */

import type { ReactNode } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

export interface FieldRowProps {
  className?: string;
  children: ReactNode;
}

/** Vertical rhythm wrapper for one field. */
export function FieldRow({ className, children }: FieldRowProps) {
  return <div className={cn('mt-3.5', className)}>{children}</div>;
}

export interface FieldLabelProps {
  /** Right-aligned hint — `changes instructions only — never capabilities`. */
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FieldLabel({ hint, className, children }: FieldLabelProps) {
  return (
    <div className={cn('mb-[7px] flex items-center text-[11px] font-medium text-room-text3', className)}>
      {children}
      {hint != null && <span className="ml-auto text-[10px] font-normal text-room-text4">{hint}</span>}
    </div>
  );
}

export interface FieldTextProps {
  /** The multi-line mandate/prompt variant. */
  tall?: boolean;
  className?: string;
  children: ReactNode;
}

/** A read-only text value in the sunken input frame. */
export function FieldText({ tall, className, children }: FieldTextProps) {
  return (
    <div
      className={cn(
        'rounded-[7px] border border-room-line-strong bg-room-sunken px-[11px] py-2.5 text-[11px] leading-relaxed text-room-text2',
        tall && 'min-h-[90px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface FieldSelectProps {
  className?: string;
  children: ReactNode;
}

/** A read-only select value: the frame and caret, no menu. */
export function FieldSelect({ className, children }: FieldSelectProps) {
  return (
    <div
      className={cn(
        'flex h-[33px] items-center rounded-[7px] border border-room-line-strong bg-room-sunken px-2.5 text-[11px] text-room-text2',
        className,
      )}
    >
      {children}
      <span aria-hidden className="ml-auto text-[9px] text-room-text4">
        ▾
      </span>
    </div>
  );
}

export interface TokenChipProps {
  /** Whether the tool/skill is granted to this member. */
  on?: boolean;
  className?: string;
  children: ReactNode;
}

/** A tools/skills chip. The × on granted chips is drawn, not clickable (D6). */
export function TokenChip({ on, className, children }: TokenChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-md border px-[9px] text-[10px]',
        on
          ? 'border-brand-primary-border bg-brand-primary-muted text-room-ink-brand'
          : 'border-room-line bg-room-sunken text-room-text3',
        className,
      )}
    >
      {children}
      {on && (
        <span aria-hidden className="text-[11px] text-room-text4">
          ×
        </span>
      )}
    </span>
  );
}
