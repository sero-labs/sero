/**
 * The observed facts a row, a page header and a step all print about running
 * work, worded once.
 *
 * Each helper reads the same bounded work feedback and returns the words, so a
 * list row and the page it opens cannot describe one wait two ways. Nothing is
 * guessed: a wait without a measured start has no duration, a tool without a
 * name is not named, and work the feedback does not mention is not described.
 */

import { feedbackActivity, type ActivityState, type FeedbackSummary, type WorkFeedback } from '@sero-ai/common';
import { formatAgo, formatClock, formatDayTime, formatTimer } from './format';

/** The call a producer holds open: what a wait needs from a snapshot. */
type Wait = WorkFeedback['wait'];

/**
 * The open call and how long it has been open. `ms` is null when the source
 * gave no start time, which is never shown as zero.
 */
export function waitParts(wait: Wait | undefined, nowMs: number): { what: string; ms: number | null } | null {
  if (!wait) return null;
  const what = wait.kind === 'request' ? 'waiting for the model' : (wait.toolName ?? 'running a tool');
  const started = wait.since ? Date.parse(wait.since) : Number.NaN;
  return { what, ms: Number.isNaN(started) ? null : Math.max(0, nowMs - started) };
}

/** The open call in words, with its measured duration when there is one. */
export function waitLine(wait: Wait | undefined, nowMs: number): string | null {
  const parts = waitParts(wait, nowMs);
  if (!parts) return null;
  return parts.ms === null ? parts.what : `${parts.what} · ${formatTimer(parts.ms)}`;
}

/**
 * What an attached producer waits on when its live view shows no tool: a quiet
 * model request, or a tool the view does not list. A request that has already
 * produced text is not a quiet one, and a producer that is not attached makes
 * no claim. Null means nothing is known.
 */
export function quietNow(
  feedback: WorkFeedback | undefined,
  epoch: string | null,
  hasText: boolean,
  nowMs: number,
): { what: string; ms: number | null } | null {
  if (!feedback || !epoch || feedbackActivity(feedback, epoch) !== 'working') return null;
  if (feedback.wait?.kind === 'request' && hasText) return null;
  return waitParts(feedback.wait, nowMs);
}

type Current = FeedbackSummary['current'][number];

interface WorkNames {
  /** The plural, for concurrency: `members` gives `2 members working`. */
  many: string;
  /** What the one worker is called. A Room names the member, a Workflow the step. */
  name: (entry: Current) => string | null;
}

/**
 * What the work under one Workflow or Room is doing now. Several workers read
 * as a count, so one reporting worker never stands for the whole run. Null when
 * nothing reports as working.
 */
function currentWork(summary: FeedbackSummary | undefined, nowMs: number, names: WorkNames): string | null {
  if (!summary || summary.activeCount === 0) return null;
  if (summary.activeCount > 1) return `${summary.activeCount} ${names.many} working`;
  const entry = summary.current[0];
  if (!entry) return null;
  const parts = [names.name(entry), waitLine(entry.wait, nowMs)].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A Room: the member's name, then its wait. */
export function roomCurrentWork(summary: FeedbackSummary | undefined, nowMs: number): string | null {
  return currentWork(summary, nowMs, { many: 'members', name: (entry) => entry.owner });
}

/**
 * A Workflow: where it is, then the wait. `position` is the caller's account of
 * the step ("Step 2 of 4"); the reporting step's own title stands in when the
 * caller has none.
 */
export function loopCurrentWork(summary: FeedbackSummary | undefined, nowMs: number, position: string | null): string | null {
  return currentWork(summary, nowMs, { many: 'steps', name: (entry) => position ?? entry.subject ?? null });
}

/** When something happened: a clock time today, a day and time before. */
function stamp(iso: string, nowMs: number): string {
  const when = new Date(iso);
  return when.toDateString() === new Date(nowMs).toDateString() ? formatClock(iso) : formatDayTime(iso);
}

/**
 * The freshness of the observation. Working work says how long ago it last did
 * something. Last-known work says when, and that it cannot be confirmed now.
 * Null when there is nothing to say.
 */
export function freshness(summary: Pick<FeedbackSummary, 'lastActivityAt'> | undefined, state: ActivityState, nowMs: number): string | null {
  const at = summary?.lastActivityAt ?? null;
  if (state === 'working') return at ? `Last activity ${formatAgo(at, nowMs)}` : null;
  if (state === 'last-known') return at ? `Last activity ${stamp(at, nowMs)} · cannot be confirmed` : 'cannot be confirmed';
  return null;
}
