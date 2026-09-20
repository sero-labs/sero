/**
 * One derivation of a Workflow's activity, in the words of the shared
 * vocabulary (@sero-ai/common activity-state).
 *
 * Home and the Workflows list both call this, so the header can no longer say
 * "0 active" over a row labelled "Active": there is one rule and one word. The
 * loop's saved `status` is an input to the rule, never the word itself.
 */

import {
  ACTIVITY_STATE_WORD,
  activityNextStep,
  isLive,
  loopAttention,
  type ActivityDetail,
  type ActivityState,
} from '@sero-ai/common';
import type { LoopSummary } from '../../shared/types';
import { formatRelative } from './format';

export interface LoopActivity {
  state: ActivityState;
  /** The state's word, e.g. "Waiting for a trigger". */
  word: string;
  /**
   * The word with what tells this row apart after it, as a list row prints it:
   * "Waiting for a trigger · a GitHub issue, a CI failure or Mondays 08:00".
   */
  line: string;
  /** What happens next, or what the user must do. Null when nothing can be said. */
  nextStep: string | null;
  /** The action a row offers when the state asks something of the user. */
  action?: string;
}

/** Plain words for the event sources a maintenance Workflow listens to. */
const EVENT_SOURCE_WORDS: Record<string, string> = {
  'github:issue-opened': 'a GitHub issue',
  'github:issue-commented': 'a GitHub issue comment',
  'github:ci-failed': 'a CI failure',
  'github:pr-opened': 'a pull request',
  'github:pr-review': 'a pull-request review',
};

const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/** "Mondays 08:00" and "daily 02:00" for the plain shapes; the expression otherwise. */
export function scheduleWords(expression: string): string {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return `the schedule ${expression}`;
  const [minute, hour, dom, month, dow] = parts;
  if (!/^\d+$/.test(minute) || !/^\d+$/.test(hour) || month !== '*') return `the schedule ${expression}`;
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  if (dom === '*' && dow === '*') return `daily ${time}`;
  if (dom === '*' && /^[0-6]$/.test(dow)) return `${DAYS[Number(dow)]} ${time}`;
  return `the schedule ${expression}`;
}

/** Everything armed on this Workflow, worded as a list: "a GitHub issue, a CI failure or Mondays 08:00". */
export function armedTriggerWords(loop: LoopSummary): string | undefined {
  const events = (loop.armedEventSources ?? []).map((source) => EVENT_SOURCE_WORDS[source] ?? source);
  const schedules = (loop.schedules ?? [])
    .filter((schedule) => !schedule.paused && !schedule.exhausted)
    .map((schedule) => scheduleWords(schedule.schedule));
  const all = [...events, ...schedules];
  if (all.length === 0) return undefined;
  if (all.length === 1) return all[0];
  return `${all.slice(0, -1).join(', ')} or ${all[all.length - 1]}`;
}

/**
 * The Workflow's state, in order of what matters most to the reader.
 *
 * `working` sits below the saved states on purpose: it is reached only through
 * a live mark. A saved active run with no mark falls to `last-known`, which is
 * the fault this change exists to fix.
 */
export function loopActivity(loop: LoopSummary, sessionStartedAt: string): LoopActivity {
  const live = isLive(loop.liveRun, sessionStartedAt);
  const ran = loop.lastRunAt ? formatRelative(loop.lastRunAt) : undefined;

  const steps = loop.progress;
  const resolve = (state: ActivityState, detail: ActivityDetail = {}, action?: string, tail?: string): LoopActivity => {
    const nextStep = activityNextStep(state, detail);
    if (nextStep === null) {
      // The state could not say what happens next, so it was not earned.
      const word = ACTIVITY_STATE_WORD['last-known'];
      return {
        state: 'last-known',
        word,
        line: ran ? `${word} · no report since ${ran}` : word,
        nextStep: activityNextStep('last-known', { lastReport: ran ?? 'its last run' }),
      };
    }
    const word = ACTIVITY_STATE_WORD[state];
    return {
      state,
      word,
      line: tail ? `${word} · ${tail}` : word,
      nextStep,
      ...(action ? { action } : {}),
    };
  };

  if (loop.status === 'complete') {
    return resolve('complete', {}, undefined, steps ? `${steps.done} of ${steps.total} steps finished` : undefined);
  }
  if (loop.status === 'disabled') return resolve('paused');
  // Whether it needs the user is decided in @sero-ai/common, so the workspace
  // tree flags exactly the Workflows this list words as asking.
  const claim = loopAttention(loop, sessionStartedAt);
  if (claim?.state === 'stopped') {
    return resolve('stopped', { cause: claim.cause, action: claim.action }, claim.action, claim.cause);
  }
  if (claim) return resolve('waiting-for-you', { action: claim.action }, claim.action, claim.action);
  if (live) return resolve('working', { subject: loop.activeStepTitles?.[0] }, undefined, loop.activeStepTitles?.[0]);
  if (loop.progress?.running || loop.liveRun) {
    return resolve('last-known', { lastReport: ran ?? 'its last run' });
  }
  if (loop.status === 'draft') return resolve('queued');
  const triggers = armedTriggerWords(loop);
  if (triggers) return resolve('waiting-for-trigger', { triggers }, undefined, triggers);
  return resolve('idle');
}

/** Whether this Workflow counts as active work happening now. One rule for every surface. */
export function isLoopActive(loop: LoopSummary, sessionStartedAt: string): boolean {
  return loopActivity(loop, sessionStartedAt).state === 'working';
}
