/**
 * Inspector run states (spec architect-run-observability).
 *
 * One place decides what the view is looking at, so every surface describes it
 * the same way and a status is never carried by colour alone: each state has a
 * word, and the tone is decoration on top of it.
 *
 * Two of these exist because the honest answer is not the tidy one. An
 * interrupted run looks like an open one until you know the project stopped, and
 * an incomplete view is not an empty one — the difference is whether anything
 * was ever reported.
 */

import type { TracePage } from './trace';
import type { TimeRange } from './timeline';

/** Why a view has no trace at all, in the words every surface uses. */
export const NOTHING_RECORDED = 'No trace was recorded for this view. Its work ran before run tracing existed, or nothing has run yet.';

export type RunState =
  | 'loading'
  | 'empty'
  | 'active'
  | 'waiting'
  | 'failed'
  | 'interrupted'
  | 'incomplete'
  | 'settled';

export interface RunStateInput {
  /** True while the runtime is being asked. */
  loading: boolean;
  /** True once an answer has arrived, so an empty view can be told from a pending one. */
  answered: boolean;
  page: TracePage | null;
  /** The selected run is still open: no end time was recorded. */
  runOpen: boolean;
  /** The project itself is stopped, blocked or paused. */
  projectHalted: boolean;
  /** A range is narrowing the view, so "no rows" may only mean "none here". */
  range: TimeRange | null;
  /** Rows after filtering. */
  visibleRecords: number;
}

export interface RunStateDescription {
  state: RunState;
  /** The word. Always present, so the state never depends on colour. */
  label: string;
  /** What it means for the numbers shown. */
  detail: string;
}

export function describeRunState(input: RunStateInput): RunStateDescription {
  const { page } = input;
  const timing = page?.timing;

  if (input.loading && !input.answered) {
    return { state: 'loading', label: 'Loading', detail: 'Reading this view from the runtime.' };
  }

  // No journal exists for this view. The runtime said so, rather than the
  // page happening to be empty, so an open run is no exception.
  if (page && !page.recorded) {
    return { state: 'empty', label: 'Nothing recorded', detail: NOTHING_RECORDED };
  }

  // Nothing was ever reported. That is not the same as reported as zero.
  if (!page || (page.records.length === 0 && !input.runOpen)) {
    return {
      state: 'empty',
      label: 'Nothing recorded',
      detail: 'No activity was reported for this view. A view that has not started and one whose telemetry failed look the same here.',
    };
  }

  if (input.projectHalted && input.runOpen) {
    return {
      state: 'interrupted',
      label: 'Interrupted',
      detail: 'This view never recorded an end and the project is stopped. Late activity from work already running still appears here.',
    };
  }

  if ((page?.summary.errors ?? 0) > 0) {
    return {
      state: 'failed',
      label: 'Failed',
      detail: `${page?.summary.errors} operation${page?.summary.errors === 1 ? '' : 's'} reported a failure. The cost already spent on them is included.`,
    };
  }

  if (input.runOpen && (timing?.waitMs ?? 0) === 0 && input.visibleRecords === 0) {
    return {
      state: 'active',
      label: 'Active',
      detail: 'This view is open and has not reported activity yet.',
    };
  }

  // The runtime folds the whole history, not just this page, to say what is
  // still waiting: a start whose end fell outside a bounded page would
  // otherwise look like an open wait it is not. A closed run cannot be waiting.
  const openWaits = timing?.openWaits ?? [];
  if (input.runOpen && openWaits.length > 0) {
    const causes = openWaits.join(', ');
    return {
      state: 'waiting',
      label: 'Waiting',
      detail: `Waiting on ${causes}, from observed intervals only. Wait time is never inferred.`,
    };
  }

  if (input.range && input.visibleRecords === 0) {
    return {
      state: 'empty',
      label: 'Nothing in this range',
      detail: 'The zoomed range contains no rows. Widen it to see the rest of the view.',
    };
  }

  if (page?.incomplete || page?.summary.incomplete) {
    return {
      state: 'incomplete',
      label: 'Partial history',
      detail: 'Some usage, timing or history was not reported, so a total here is a lower bound and this page is not the whole history.',
    };
  }

  return {
    state: 'settled',
    label: 'Complete',
    detail: input.runOpen ? 'This view is still open and everything reported so far is shown.' : 'Everything reported for this view is shown.',
  };
}
