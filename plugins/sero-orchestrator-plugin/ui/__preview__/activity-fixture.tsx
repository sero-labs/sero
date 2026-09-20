/**
 * The Workflows, Rooms and Home previews for the activity vocabulary.
 *
 * The rows are the profile the approved drawing was made from: one maintenance
 * Workflow armed on triggers, five finished ones, one of them with suggested
 * changes waiting, and two Rooms. Nothing here is live; the point is to put the
 * built surface next to the drawing at the same width.
 */

import { useState } from 'react';
import { AppContext, type AppContextValue } from '@sero-ai/app-runtime';
import type { GoalIndexEntry } from '../../shared/goal-types';
import type { RoomSummary } from '../../shared/room-types';
import type { LoopSummary } from '../../shared/types';
import { HomeView } from '../components/HomeView';
import { RoomsOverview } from '../components/RoomsOverview';
import { WorkflowsList } from '../components/WorkflowsList';

const days = (count: number): string => new Date(Date.now() - count * 86_400_000).toISOString();

function loop(partial: Partial<LoopSummary> & Pick<LoopSummary, 'id' | 'title'>): LoopSummary {
  return {
    status: 'complete',
    summary: '',
    prompt: '',
    createdAt: days(30),
    updatedAt: days(9),
    ...partial,
  };
}

const PREVIEW_LOOPS: LoopSummary[] = [
  loop({
    id: 'maintenance',
    title: 'reading-tracker-resilience-01: maintenance',
    status: 'active',
    armedEventSources: ['github:issue-opened', 'github:ci-failed'],
    schedules: [{ triggerId: 't1', type: 'hybrid', schedule: '0 8 * * 1' }],
    lastRunAt: days(5),
    progress: { total: 2, done: 2, running: false },
    usage: { costUsd: 1.53 },
  }),
  loop({ id: 'l2', title: 'Composable title search', progress: { total: 3, done: 3, running: false }, usage: { costUsd: 3.55 }, lastRunAt: days(9) }),
  loop({ id: 'l3', title: 'End-to-end resilience and release verification', progress: { total: 4, done: 4, running: false }, usage: { costUsd: 3.71 }, lastRunAt: days(9) }),
  loop({
    id: 'l4',
    title: 'Release the completed reading tracker',
    progress: { total: 3, done: 3, running: false },
    usage: { costUsd: 1.83 },
    lastRunAt: days(9),
    pendingSuggestions: 3,
    attention: {
      suggestions: [
        { id: 's1', rationale: 'Name the release in the PR title', confidence: 'high', changedStepCount: 1 },
        { id: 's2', rationale: 'Verify the changelog before the tag', confidence: 'medium', changedStepCount: 4 },
        { id: 's3', rationale: 'Drop the duplicate build step', confidence: 'high', changedStepCount: 1 },
      ],
    },
  }),
  loop({ id: 'l5', title: 'Reading tracker web experience', progress: { total: 3, done: 3, running: false }, usage: { costUsd: 6.21 }, lastRunAt: days(9) }),
  loop({ id: 'l6', title: 'Local service and durable database', progress: { total: 4, done: 4, running: false }, usage: { costUsd: 1.88 }, lastRunAt: days(9) }),
];

function room(partial: Partial<RoomSummary> & Pick<RoomSummary, 'id' | 'title'>): RoomSummary {
  return {
    status: 'running',
    memberCount: 2,
    activeMemberCount: 0,
    costUsd: 0.31,
    maxCostUsd: 2,
    startedAt: days(9),
    updatedAt: days(8),
    members: [
      { id: 'm1', name: 'Adversary', isConductor: false },
      { id: 'm2', name: 'Conductor', isConductor: true },
    ],
    attentionCount: 0,
    deliveredAt: null,
    deliveryRef: null,
    ...partial,
  };
}

const PREVIEW_ROOMS: RoomSummary[] = [
  room({
    id: 'room-1',
    title: 'CSV Summariser Adversarial Validation',
    status: 'paused',
    attentionCount: 2,
    attention: { approvals: [], requests: [{ memberId: 'm1', memberName: 'Adversary', question: 'Which contract governs the empty file?' }] },
  }),
  room({ id: 'room-2', title: 'Import Dashboard Discovery', status: 'completed', costUsd: 5.54, updatedAt: days(12) }),
];

const GOALS: GoalIndexEntry[] = [];

// Home names the workspace it is talking about, which the host supplies.
const APP_CONTEXT = {
  appId: 'orchestrator',
  workspaceId: 'ws-1',
  workspacePath: '/repos/reading-tracker-resilience-01',
  stateFilePath: '/repos/reading-tracker-resilience-01/.sero/apps/orchestrator/index.json',
} as AppContextValue;

/** Home, with the status line, the grouped suggestions and the lists under it. */
export function HomePreview() {
  return (
    <AppContext.Provider value={APP_CONTEXT}>
    <HomeView
      loops={PREVIEW_LOOPS}
      busy={false}
      onAction={() => undefined}
      onOpenLoop={() => undefined}
      onNew={() => undefined}
      onNewRoom={() => undefined}
      rooms={PREVIEW_ROOMS}
      goals={GOALS}
      onOpenGoal={() => undefined}
      onDeleteGoal={() => undefined}
    />
    </AppContext.Provider>
  );
}

/** The Workflows tab at full width, with its own search. */
export function WorkflowsListPreview() {
  const [query, setQuery] = useState('');
  return (
    <WorkflowsList
      loops={PREVIEW_LOOPS}
      query={query}
      onQueryChange={setQuery}
      onSelect={() => undefined}
      onNew={() => undefined}
    />
  );
}

/** The Rooms list: what each Room waits for, with its members kept. */
export function RoomsPreview() {
  return <RoomsOverview rooms={PREVIEW_ROOMS} onOpenRoom={() => undefined} onNew={() => undefined} />;
}
