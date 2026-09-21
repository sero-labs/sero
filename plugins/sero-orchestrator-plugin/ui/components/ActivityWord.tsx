/**
 * A state as a glyph chip and a word.
 *
 * The id, the word, the glyph shape and the tint come from the shared
 * vocabulary; only the icon set is chosen here. The chip is drawn to the
 * approved proposal: a 16px rounded square holding a 10px stroke icon. Nothing
 * animates, and with colour removed the word and the shape still say what is
 * happening.
 */

import type { ComponentType } from 'react';
import {
  ACTIVITY_STATE_GLYPH,
  ACTIVITY_STATE_TONE,
  type ActivityGlyph,
  type ActivityState,
  type ActivityTone,
} from '@sero-ai/common';
import { cn } from '@sero-ai/ui/lib/utils';
import { Check, Clock, History, Layers, Minus, MessageCircleQuestion, OctagonAlert, Pause, Play } from 'lucide-react';

const GLYPH_ICON: Record<ActivityGlyph, ComponentType<{ className?: string }>> = {
  play: Play,
  stack: Layers,
  clock: Clock,
  question: MessageCircleQuestion,
  pause: Pause,
  dash: Minus,
  check: Check,
  alert: OctagonAlert,
  history: History,
};

/** The chip's wash and icon colour. The word carries the meaning without it. */
const TONE_CHIP: Record<ActivityTone, string> = {
  live: 'bg-brand-primary/12 text-brand-primary',
  armed: 'bg-status-info/14 text-status-info',
  attention: 'bg-status-warning/14 text-status-warning',
  danger: 'bg-status-error/14 text-status-error',
  stale: 'bg-room-muted text-status-warning',
  neutral: 'bg-room-muted text-room-text2',
};

export interface ActivityWordProps {
  state: ActivityState;
  word: string;
  /** What happens next; shown as the hover and focus title. */
  nextStep?: string | null;
  className?: string;
}

export function ActivityGlyphChip({ state, className }: { state: ActivityState; className?: string }) {
  const Icon = GLYPH_ICON[ACTIVITY_STATE_GLYPH[state]];
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-4 shrink-0 place-items-center rounded-[4px]',
        TONE_CHIP[ACTIVITY_STATE_TONE[state]],
        className,
      )}
    >
      <Icon className="size-2.5" />
    </span>
  );
}

export function ActivityWord({ state, word, nextStep, className }: ActivityWordProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-[7px] text-xs text-room-text2', className)}
      title={nextStep ?? undefined}
      data-activity-state={state}
    >
      <ActivityGlyphChip state={state} />
      {word}
    </span>
  );
}
