/**
 * The Workflows, Rooms and Home previews for the activity vocabulary.
 *
 * The rows are the profile the approved drawing was made from: one maintenance
 * Workflow armed on triggers, five finished ones, one of them with suggested
 * changes waiting, and two Rooms. Beside them sit the live-work states of
 * `autonomous-delivery`: working, a quiet model request, last known, a draining
 * pause, a time-limit hold and a delivered Room. Nothing here is live; the
 * work feedback comes from a stand-in bridge below, and every value is example
 * data. The point is to put the built surface next to the drawing at the same
 * width.
 */

import { useState } from 'react';
import { AppContext, type AppContextValue } from '@sero-ai/app-runtime';
import type { FeedbackSnapshotReply, WorkFeedback } from '@sero-ai/common';
import type { GoalIndexEntry } from '../../shared/goal-types';
import type { RoomSummary } from '../../shared/room-types';
import type { LoopSummary } from '../../shared/types';
import { HomeView } from '../components/HomeView';
import { RoomsOverview } from '../components/RoomsOverview';
import { WorkflowsList } from '../components/WorkflowsList';

const days = (count: number): string => new Date(Date.now() - count * 86_400_000).toISOString();
const secondsAgo = (count: number): string => new Date(Date.now() - count * 1000).toISOString();

/** The runtime session the stand-in feedback claims to come from. */
const FEEDBACK_EPOCH = '2026-10-03T09:00:00.000Z';

function reported(key: string, workId: string, owner: string, wait: WorkFeedback['wait'], over: Partial<WorkFeedback> = {}): WorkFeedback {
  return {
    key, kind: 'room-member', owner, epoch: FEEDBACK_EPOCH, revision: 1, turnId: 't1', attached: true, wait, openCalls: wait ? 1 : 0,
    lastActivityAt: secondsAgo(8), contactObservedAt: secondsAgo(1), terminal: null,
    scope: { appId: 'orchestrator', workspaceId: 'ws-1', workId },
    ...over,
  };
}

/**
 * What the runtime would report for the example rows. Built on each read so
 * the open waits are measured against the time the preview is looked at.
 */
function previewFeedback(): FeedbackSnapshotReply {
  return {
    epoch: FEEDBACK_EPOCH,
    snapshots: [
      // Working: two members at once, so the row counts them.
      reported('member:room-working:m1', 'room-working', 'Adversary', { kind: 'tool', toolName: 'bash', since: secondsAgo(12) }),
      reported('member:room-working:m2', 'room-working', 'Conductor', { kind: 'request', since: secondsAgo(5) }),
      // A quiet model request with a measured wait.
      reported('member:room-quiet:m1', 'room-quiet', 'Adversary', { kind: 'request', since: secondsAgo(47) }, { lastActivityAt: secondsAgo(47) }),
      // Draining pause: two turns still finish.
      reported('member:room-pausing:m1', 'room-pausing', 'Adversary', { kind: 'request', since: secondsAgo(20) }),
      reported('member:room-pausing:m2', 'room-pausing', 'Conductor', { kind: 'tool', toolName: 'edit', since: secondsAgo(9) }),
      // A Workflow step waiting on the model, with a measured wait.
      reported('attempt:a1', 'loop-working', 'agent', { kind: 'request', since: secondsAgo(47) }, {
        kind: 'workflow-attempt', subject: 'Sweep the filter', lastActivityAt: secondsAgo(60),
        scope: { appId: 'orchestrator', workspaceId: 'ws-1', workId: 'loop-working', attemptId: 'a1' },
      }),
    ],
  };
}

// The rows read work feedback through the host bridge, which does not exist
// here. A bridge that answers only the feedback read stands in for it. It never
// replaces a real one, and its other capabilities stay absent.
const shell = globalThis as { sero?: { appState?: unknown; appAgent?: Record<string, unknown> } };
shell.sero ??= { appState: {}, appAgent: {} };
shell.sero.appAgent ??= {};
shell.sero.appAgent.invokeTool ??= async () => ({ text: '', details: { ok: true, feedback: previewFeedback() } });

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
  // Working: a step waits on the model, and the wait is measured.
  loop({
    id: 'loop-working',
    title: 'Check sound and controls',
    status: 'active',
    progress: { total: 4, done: 1, running: true },
    activeStepTitles: ['Sweep the filter'],
    usage: { costUsd: 0.21 },
    lastRunAt: secondsAgo(60),
  }),
  // Last known: saved as running, but this session has no contact with it.
  loop({
    id: 'loop-last-known',
    title: 'Nightly dependency audit',
    status: 'active',
    progress: { total: 4, done: 1, running: true },
    activeStepTitles: ['Read the lockfile'],
    usage: { costUsd: 0.4 },
    lastRunAt: days(1),
  }),
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
  room({ id: 'room-2', title: 'Import Dashboard Discovery', status: 'completed', costUsd: 5.54, updatedAt: days(12), maxWallClockMs: 30 * 60_000, activeMs: 24 * 60_000, activeSince: null }),
  // Working: two members at once.
  room({ id: 'room-working', title: 'Build the synth', maxWallClockMs: 30 * 60_000, activeMs: 12 * 60_000, activeSince: null, costUsd: 0.83 }),
  // A quiet model request with a measured wait, one member.
  room({
    id: 'room-quiet', title: 'Tune the filter sweep', maxWallClockMs: 30 * 60_000, activeMs: 12 * 60_000, activeSince: null,
    members: [{ id: 'm1', name: 'Adversary', isConductor: false }],
  }),
  // Last known: saved as running, no contact in this session.
  room({ id: 'room-last-known', title: 'Audit the keyboard map', maxWallClockMs: 30 * 60_000, activeMs: 12 * 60_000, activeSince: null }),
  // A pause that lets two turns finish.
  room({ id: 'room-pausing', title: 'Review the envelope', status: 'pausing', maxWallClockMs: 30 * 60_000, activeMs: 12 * 60_000, activeSince: null, activeMemberCount: 2 }),
  // Stopped at its time limit: the hold inside the Room offers Add time.
  room({
    id: 'room-time-limit', title: 'Build the synth (long run)', status: 'paused', maxWallClockMs: 30 * 60_000, activeMs: 30 * 60_000, activeSince: null, costUsd: 0.83,
    attentionCount: 1,
    attention: { approvals: [], pause: { kind: 'limit-reached', detail: 'Time limit reached.', at: secondsAgo(90) } },
  }),
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
    <AppContext.Provider value={APP_CONTEXT}>
      <WorkflowsList
        loops={PREVIEW_LOOPS}
        query={query}
        onQueryChange={setQuery}
        onSelect={() => undefined}
        onNew={() => undefined}
      />
    </AppContext.Provider>
  );
}

/** The Rooms list: what each Room waits for, with its members kept. */
export function RoomsPreview() {
  return (
    <AppContext.Provider value={APP_CONTEXT}>
      <RoomsOverview rooms={PREVIEW_ROOMS} onOpenRoom={() => undefined} onNew={() => undefined} />
    </AppContext.Provider>
  );
}
