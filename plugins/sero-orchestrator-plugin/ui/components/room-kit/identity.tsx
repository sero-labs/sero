/**
 * room-kit/identity — who is in the Room and what state they are in.
 * Face, FaceStack, StatusDot, LivePill (ux-refit-plan.md §4).
 *
 * Every colour is a host theme token through the room aliases in styles.css.
 */

import type { ReactNode } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { memberAvatar } from '../../lib/member-avatar';

export type MemberTone = 'member' | 'conductor' | 'new';

export type MemberStatus =
  | 'working'
  | 'waiting'
  | 'idle'
  | 'blocked'
  | 'done'
  | 'suspended';

/** Fill for a status dot. Standalone dots add the working glow themselves. */
const DOT_FILL: Record<MemberStatus, string> = {
  working: 'bg-brand-primary',
  waiting: 'bg-status-warning',
  idle: 'bg-room-text4',
  blocked: 'bg-status-error',
  done: 'bg-status-info',
  suspended: 'bg-collab-primary',
};

const FACE_TONES: Record<MemberTone, string> = {
  member: 'bg-linear-[140deg] from-room-face-from to-room-face-to text-room-text2',
  conductor: 'bg-linear-[140deg] from-room-face-c-from to-room-face-c-to text-room-ink-brand',
  new: 'bg-linear-[140deg] from-room-face-new-from to-room-face-new-to text-room-ink-collab',
};

/** Radius and glyph size scale with the box (22–36px, from the prototype). */
const FACE_SIZES = {
  22: 'size-[22px] rounded-[6px] text-[9px]',
  24: 'size-[24px] rounded-[7px] text-[10px]',
  26: 'size-[26px] rounded-[7px] text-[10px]',
  30: 'size-[30px] rounded-[8px] text-[11px]',
  36: 'size-[36px] rounded-[9px] text-[13px]',
} as const;

export type FaceSize = keyof typeof FACE_SIZES;

export interface FaceProps {
  /** Stable member key used to generate the avatar. */
  seed: string;
  /** One or two glyphs: an initial, a number, or ◎ for the Conductor. */
  label: ReactNode;
  tone?: MemberTone;
  size?: FaceSize;
  /** Renders the corner status dot. */
  status?: MemberStatus;
  /** Ring around the corner dot — match it to the surface behind the face. */
  statusRingClass?: string;
  className?: string;
}

/** The rounded-square member avatar. */
export function Face({
  seed,
  label,
  tone = 'member',
  size = 26,
  status,
  statusRingClass = 'border-room-bg',
  className,
}: FaceProps) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center font-medium',
        FACE_SIZES[size],
        FACE_TONES[tone],
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <img src={memberAvatar(seed)} alt="" className="size-full rounded-[inherit]" />
      {status && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-[9px] rounded-full border-2',
            statusRingClass,
            DOT_FILL[status],
          )}
        />
      )}
    </span>
  );
}

export interface FaceStackProps {
  faces: Array<{ seed: string; label: ReactNode; tone?: MemberTone }>;
  className?: string;
}

/** The overlapping face row on list rows (Home). Circular, unlike Face. */
export function FaceStack({ faces, className }: FaceStackProps) {
  return (
    <span className={cn('flex pl-[5px]', className)}>
      {faces.map((face) => (
        <span
          key={face.seed}
          className={cn(
            'grid size-[22px] shrink-0 place-items-center rounded-full border-2 border-room-surface text-[9px] -ml-[5px]',
            FACE_TONES[face.tone ?? 'member'],
          )}
        >
          <span className="sr-only">{face.label}</span>
          <img src={memberAvatar(face.seed)} alt="" className="size-full rounded-full" />
        </span>
      ))}
    </span>
  );
}

export interface StatusDotProps {
  status: MemberStatus;
  className?: string;
}

/** The 7px standalone status dot; working carries the glow ring. */
export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-block size-[7px] shrink-0 rounded-full',
        DOT_FILL[status],
        status === 'working' && 'shadow-[0_0_0_3px_var(--brand-primary-muted)]',
        className,
      )}
    />
  );
}

export interface LivePillProps {
  /** `LIVE · TURN 9`, `Waiting 3m`, `Finished`, … */
  children: ReactNode;
  idle?: boolean;
  className?: string;
}

/** The uppercase live/idle streaming pill on watch tiles and follow bars. */
export function LivePill({ children, idle = false, className }: LivePillProps) {
  return (
    <span
      className={cn(
        'room-mono-micro inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[10px] px-2 uppercase tracking-[0.08em]',
        idle ? 'bg-room-muted text-room-text4' : 'bg-brand-primary-subtle text-room-ink-brand',
        className,
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          idle ? 'bg-room-text4' : 'bg-brand-primary shadow-[0_0_0_3px_var(--brand-primary-subtle)]',
        )}
      />
      {children}
    </span>
  );
}
