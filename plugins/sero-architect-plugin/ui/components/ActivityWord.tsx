/**
 * A state as a glyph chip and a word, plus the second line that says whose work
 * it is.
 *
 * The words, the glyph shapes and the tint come from the shared vocabulary so
 * the Architect list, the Orchestrator and the workspace tree read alike. The
 * chip is drawn to the approved proposal: a 16px rounded square holding a 10px
 * stroke icon, tinted by tone. Nothing animates, and every state also carries
 * its word and its own shape, so ignoring colour loses nothing.
 */

import type { ComponentType } from 'react';
import {
  ACTIVITY_STATE_GLYPH,
  ACTIVITY_STATE_TONE,
  type ActivityGlyph,
  type ActivityState,
} from '@sero-ai/common';
import { Check, Clock, History, Layers, Minus, MessageCircleQuestion, OctagonAlert, Pause, Play } from 'lucide-react';
import type { ProjectActivity } from '../../shared/activity';
import { ownerSentence } from '../lib/format';

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

export function ActivityGlyphIcon({ state }: { state: ActivityState }) {
  const Icon = GLYPH_ICON[ACTIVITY_STATE_GLYPH[state]];
  return (
    <span className="ar-gchip" data-tone={ACTIVITY_STATE_TONE[state]} aria-hidden="true">
      <Icon className="ar-gi" />
    </span>
  );
}

/**
 * The project header shows this line under its own heading, so it is its own
 * component: rendering the full two lines there printed the glyph twice.
 */
export function ActivityOwner({ activity }: { activity: ProjectActivity }) {
  const second = ownerSentence(activity);
  return second ? <small>{second}</small> : null;
}

/** The activity, in two lines: the state that matters, then whose work it is. */
export function ActivityLines({ activity }: { activity: ProjectActivity }) {
  return (
    <span className="ar-activity" data-activity-state={activity.state}>
      <span className="ar-activity-state">
        <ActivityGlyphIcon state={activity.state} />
        <div>
          <div>{activity.headline}</div>
          <ActivityOwner activity={activity} />
        </div>
      </span>
     
    </span>
  );
}
