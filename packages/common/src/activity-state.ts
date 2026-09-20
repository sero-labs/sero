/**
 * The activity vocabulary shared by Architect, the Orchestrator, Rooms and the
 * workspace tree.
 *
 * One situation must read the same way on every surface, so the word, the glyph
 * and the "what happens next" sentence live here rather than in each UI. A
 * surface renders the glyph id with its own icon set; it never renames a state.
 *
 * `working` is deliberately hard to reach: it needs a liveness mark that a
 * runtime wrote while it watched the run report. A saved status of running,
 * active or in progress is not enough, because a saved status outlives the run
 * that set it.
 */

export type ActivityState =
  | 'working'
  | 'queued'
  | 'waiting-for-trigger'
  | 'waiting-for-you'
  | 'paused'
  | 'idle'
  | 'complete'
  | 'stopped'
  | 'last-known';

export const ACTIVITY_STATES: readonly ActivityState[] = [
  'working',
  'queued',
  'waiting-for-trigger',
  'waiting-for-you',
  'paused',
  'idle',
  'complete',
  'stopped',
  'last-known',
];

/**
 * Glyph shapes, not icons. Each surface maps the id to its own icon set; the
 * shapes differ from one another so the state survives without colour.
 *
 * The shapes are the ones drawn in the approved proposal,
 * `apps/styleguide/public/prototypes/agent-workspace-ux-audit/1-activity-at-a-glance.html`.
 */
export type ActivityGlyph =
  | 'play'
  | 'stack'
  | 'clock'
  | 'question'
  | 'pause'
  | 'dash'
  | 'check'
  | 'alert'
  | 'history';

export const ACTIVITY_STATE_WORD: Record<ActivityState, string> = {
  working: 'Working',
  queued: 'Queued',
  'waiting-for-trigger': 'Waiting for a trigger',
  'waiting-for-you': 'Waiting for you',
  paused: 'Paused',
  idle: 'Idle',
  complete: 'Complete',
  stopped: 'Stopped',
  'last-known': 'Last known',
};

export const ACTIVITY_STATE_GLYPH: Record<ActivityState, ActivityGlyph> = {
  working: 'play',
  queued: 'stack',
  'waiting-for-trigger': 'clock',
  'waiting-for-you': 'question',
  paused: 'pause',
  idle: 'dash',
  complete: 'check',
  stopped: 'alert',
  'last-known': 'history',
};

/**
 * How a surface tints the glyph chip behind the shape.
 *
 * Colour is decided once, here, because the same situation must be tinted the
 * same way in Architect, the Orchestrator and the workspace tree. It carries no
 * meaning on its own: every state also has a word and its own glyph shape, so
 * ignoring colour entirely loses nothing.
 */
export type ActivityTone = 'live' | 'armed' | 'attention' | 'danger' | 'stale' | 'neutral';

export const ACTIVITY_STATE_TONE: Record<ActivityState, ActivityTone> = {
  working: 'live',
  queued: 'armed',
  'waiting-for-trigger': 'armed',
  'waiting-for-you': 'attention',
  paused: 'neutral',
  idle: 'neutral',
  complete: 'neutral',
  stopped: 'danger',
  // Amber on a plain chip, not an amber chip: the product is unsure, which is
  // not the same claim as "this needs you".
  'last-known': 'stale',
};

/** The parts a surface supplies so a state can say what happens next. */
export interface ActivityDetail {
  /** The work itself: a milestone title, a Workflow name, a question. */
  subject?: string;
  /** What starts the work, for `waiting-for-trigger`. */
  triggers?: string;
  /** Why the work stopped, for `stopped`. */
  cause?: string;
  /** What the user must do, for `waiting-for-you` and `stopped`. */
  action?: string;
  /** When the work last reported, worded by the caller, for `last-known`. */
  lastReport?: string;
}

/** What each state cannot say its next step without. */
const REQUIRED_DETAIL: Record<ActivityState, readonly (keyof ActivityDetail)[]> = {
  working: [],
  queued: [],
  'waiting-for-trigger': ['triggers'],
  'waiting-for-you': ['action'],
  paused: [],
  idle: [],
  complete: [],
  stopped: ['cause', 'action'],
  'last-known': ['lastReport'],
};

/**
 * The detail keys this state needs and did not get. A caller that gets a
 * non-empty list has not earned the state and falls back to `last-known`.
 */
export function missingActivityDetail(
  state: ActivityState,
  detail: ActivityDetail,
): readonly (keyof ActivityDetail)[] {
  return REQUIRED_DETAIL[state].filter((key) => {
    const value = detail[key];
    return typeof value !== 'string' || value.trim() === '';
  });
}

/**
 * One sentence saying what happens next, or what the user must do. Returns null
 * when the state's required detail is missing, so a surface cannot print half a
 * sentence: it shows `last-known` instead.
 */
export function activityNextStep(state: ActivityState, detail: ActivityDetail = {}): string | null {
  if (missingActivityDetail(state, detail).length > 0) return null;
  const subject = detail.subject?.trim();
  switch (state) {
    case 'working':
      return subject ? `Working on ${subject}.` : 'A run is reporting now.';
    case 'queued':
      return subject ? `${subject} starts when the work before it ends.` : 'Starts when the work before it ends.';
    case 'waiting-for-trigger':
      return `Starts on ${detail.triggers}.`;
    case 'waiting-for-you':
      return `${detail.action}.`;
    case 'paused':
      return 'Nothing starts until you resume.';
    case 'idle':
      return 'Nothing is queued.';
    case 'complete':
      return 'Finished. Nothing more runs.';
    case 'stopped':
      return `${detail.cause}. ${detail.action}.`;
    case 'last-known':
      return `No report since ${detail.lastReport}. Open the work to check.`;
  }
}

/**
 * When this process started, as the anchor for `isLive`.
 *
 * `performance.timeOrigin` is the start of the renderer's page or of the Node
 * process, which is the Sero session for every surface that reads a mark: a
 * mark reported before it belongs to an earlier session. A dev reload moves the
 * anchor forward, which can only make a state read as less live, never more.
 */
export function sessionStartedAt(): string {
  return new Date(performance.timeOrigin).toISOString();
}

/**
 * A mark a runtime writes while it watches a run report, and clears when the
 * run ends. Its `reportedAt` is the last report the writer saw, never a guess.
 */
export interface LiveRunMark {
  runId: string;
  /** ISO time the run started. */
  startedAt: string;
  /** ISO time of the last report the writer observed. */
  reportedAt: string;
}

/**
 * Whether a mark counts as live for a reader whose session began at
 * `sessionStartedAt` (ISO).
 *
 * A mark reported before the reader's session started was written by an earlier
 * one, so it cannot prove anything is running now. There is no timeout here: a
 * run stays live for as long as it keeps reporting.
 */
export function isLive(
  mark: LiveRunMark | null | undefined,
  sessionStartedAt: string | null | undefined,
): boolean {
  if (!mark || !sessionStartedAt) return false;
  const reported = Date.parse(mark.reportedAt);
  const session = Date.parse(sessionStartedAt);
  if (Number.isNaN(reported) || Number.isNaN(session)) return false;
  return reported >= session;
}
