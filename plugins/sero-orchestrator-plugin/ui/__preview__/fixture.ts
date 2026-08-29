/**
 * A typed Loop for the component previews.
 *
 * It carries every shape the plan map has to draw: a fan out, two approval
 * gates, a branch with one path skipped, two parallel stages, a loop back with
 * traversals used, and a mix of done, running, blocked, skipped, and pending
 * steps. Keep it typed — a cast would hide the field a component reads.
 */

import {
  DEFAULT_LIMITS,
  DEFAULT_LOG_POLICY,
  DEFAULT_WORKSPACE_SETTINGS,
} from '../../shared/defaults';
import type {
  Loop,
  LoopStepDefinition,
  StepAttempt,
  StepRuntimeState,
  StepStatus,
} from '../../shared/types';

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString();

const step = (
  id: string,
  title: string,
  dependsOn: string[] | undefined,
  extra: Partial<LoopStepDefinition> = {},
): LoopStepDefinition => ({
  id,
  title,
  instructions: title,
  dependsOn,
  execution: { type: 'background-agent' },
  ...extra,
});

const STEPS: LoopStepDefinition[] = [
  step('discover', 'Discover levels and validate the checker', undefined, {
    execution: { type: 'background-agent', agent: 'explorer' },
    expectedOutcome: 'A list of levels and the command that checks one.',
  }),
  step('check', 'Check each level independently', ['discover'], {
    fanOut: { itemsFrom: 'levels', itemVariable: 'levelItem', maxItems: 10, maxConcurrency: 4 },
  }),
  step('diagnose', 'Diagnose failures and rank them', ['check']),
  step('solutions', 'Obtain protected solutions', ['diagnose'], { gate: 'approval' }),
  step('strategy', 'Choose a repair strategy', ['solutions'], {
    execution: { type: 'model' },
    produces: ['strategy'],
  }),
  step('patch', 'Patch the level content', ['strategy'], {
    execution: { type: 'background-agent', agent: 'builder' },
    when: { var: 'strategy', in: ['patch'] },
  }),
  step('regenerate', 'Regenerate the level from its spec', ['strategy'], {
    when: { var: 'strategy', in: ['regenerate'] },
  }),
  step('tests', 'Update the level tests', ['patch', 'regenerate'], {
    expectedOutcome: 'Tests match the new difficulty band.',
  }),
  step('index', 'Refresh the level index', ['patch', 'regenerate'], { execution: { type: 'model' } }),
  step('recheck', 'Re-check all levels', ['tests', 'index'], {
    expectedOutcome: 'Every level inside its band.',
    feedback: {
      id: 'again',
      toStepId: 'patch',
      when: { var: 'levelsOk', in: [false] },
      maxTraversalsPerRun: 3,
    },
  }),
  step('table', 'Update the difficulty table', ['recheck'], {
    execution: { type: 'model' },
    expectedOutcome: 'One row for each level.',
  }),
  step('note', 'Write the migration note', ['recheck'], {
    execution: { type: 'model' },
    expectedOutcome: 'A short note for the release.',
  }),
  step('review', 'Review the diff', ['table', 'note'], {
    gate: 'approval',
    execution: {
      type: 'active-session',
      sessionTarget: {
        workspaceId: 'workspace',
        strategy: 'most-recent-active',
        deliverAs: 'steer',
        triggerTurn: true,
      },
    },
    expectedOutcome: 'You approve, or you ask for a change.',
  }),
  step('pull-request', 'Commit and open the pull request', ['review'], {
    expectedOutcome: 'One pull request for all the repairs.',
  }),
  step('report', 'Report the result to the room', ['pull-request'], {
    expectedOutcome: 'A summary in the team room.',
  }),
];

interface Progress {
  status: StepStatus;
  summary?: string;
  attempts?: number;
  /** Minutes the newest attempt took. Absent while a step still runs. */
  minutes?: number;
}

const PROGRESS: Record<string, Progress> = {
  discover: { status: 'succeeded', summary: '10 levels found. The checker runs clean.', minutes: 2 },
  check: { status: 'succeeded', summary: '3 of 10 levels are outside their band.', minutes: 6 },
  diagnose: { status: 'succeeded', summary: '2 too easy, 1 unsolvable. Ranked by cost.', minutes: 2 },
  solutions: { status: 'succeeded', summary: 'You approved. 3 solutions read.', minutes: 1 },
  strategy: { status: 'succeeded', summary: 'strategy = patch', minutes: 1 },
  patch: { status: 'succeeded', summary: '3 levels edited. Attempt 2 passed.', attempts: 2, minutes: 3 },
  regenerate: { status: 'skipped', summary: 'Path not taken.' },
  tests: { status: 'running' },
  index: { status: 'blocked', summary: 'Waits for you: 2 titles conflict.' },
};

const OUTCOME_STATUS: Record<string, 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'needs-revision'> = {
  succeeded: 'succeeded',
  failed: 'failed',
  blocked: 'blocked',
  skipped: 'skipped',
  'needs-revision': 'needs-revision',
};

function stepStates(): Record<string, StepRuntimeState> {
  return Object.fromEntries(STEPS.map((definition, index) => {
    const progress = PROGRESS[definition.id];
    const state: StepRuntimeState = {
      status: progress?.status ?? 'pending',
      attempts: progress?.attempts ?? (progress ? 1 : 0),
      updatedAt: at(index),
      outcome: progress?.summary
        ? { status: OUTCOME_STATUS[progress.status] ?? 'succeeded', summary: progress.summary }
        : undefined,
    };
    return [definition.id, state];
  }));
}

function stepAttempts(): StepAttempt[] {
  return Object.entries(PROGRESS).map(([stepId, progress], index) => ({
    id: `attempt-${index}`,
    stepId,
    attemptNumber: progress.attempts ?? 1,
    parentSessionId: 'preview-session',
    executionType: 'background-agent',
    status: progress.minutes === undefined ? 'running' : 'completed',
    observations: [],
    startedAt: at(index * 8),
    endedAt: progress.minutes === undefined ? undefined : at(index * 8 + progress.minutes),
  }));
}

export const previewLoop: Loop = {
  id: 'preview-loop',
  workspaceId: 'workspace',
  title: 'Repair the failing levels',
  prompt: 'Find every failing level and repair it.',
  summary: 'Checks each level, repairs the ones outside their band, and opens a pull request.',
  status: 'active',
  workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
  plan: {
    schemaVersion: 1,
    revision: 1,
    objective: 'Every level inside its difficulty band',
    steps: STEPS,
  },
  runtime: {
    parentSessionId: 'preview-session',
    variables: { strategy: 'patch' },
    stepStates: stepStates(),
    workspace: {},
    feedbackStates: { again: { traversals: 1 } },
  },
  triggers: [],
  limits: { ...DEFAULT_LIMITS },
  logPolicy: { ...DEFAULT_LOG_POLICY },
  warnings: [],
  runs: [{
    id: 'run-1',
    runNumber: 1,
    status: 'running',
    startedStepIds: STEPS.map((definition) => definition.id),
    stepAttempts: stepAttempts(),
    recoveryDecisions: [],
    observations: [],
    startedAt: at(0),
  }],
  revisions: [],
  createdAt: at(0),
  updatedAt: at(60),
};
