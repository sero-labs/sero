/**
 * The maintenance Workflow: one per project, created by the runtime when the
 * project enters maintain. It listens to GitHub issues, CI failures and a
 * weekly schedule; each run's completion wakes the owner to triage.
 */

import type { OrchestratorBoardTriggerSuggestion } from '@sero-ai/common';

import type { ProjectRecord } from './record';

export const MAINTENANCE_MILESTONE_ID = 'maintenance';

/** Mondays at 08:00 UTC. */
export const MAINTENANCE_SCHEDULE = '0 8 * * 1';

export const MAINTENANCE_TRIGGERS: readonly OrchestratorBoardTriggerSuggestion[] = [
  { type: 'event', eventSource: 'github:issue-opened' },
  { type: 'event', eventSource: 'github:ci-failed' },
  { type: 'cron', schedule: MAINTENANCE_SCHEDULE },
];

export function maintenancePrompt(record: ProjectRecord): string {
  return [
    `Maintenance triage for the project "${record.name}" in ${record.folder}.`,
    'This Workflow runs when a GitHub issue is opened, when CI fails, and once a week.',
    'On each run: read the event that fired it (or, for the weekly run, the open issues and the latest CI results),',
    'reproduce or confirm the problem where you can without changing the code, and write a short triage note to',
    '.sero/apps/architect/triage/<date>-<slug>.md with: what happened, where in the code it likely is, a severity, and a suggested fix.',
    'Do not change the project code and do not open a pull request; the project owner decides what to dispatch.',
    'Finish by reporting the triage note path in your completion.',
  ].join(' ');
}
