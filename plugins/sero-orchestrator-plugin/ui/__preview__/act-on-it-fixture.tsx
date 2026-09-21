/**
 * The Workflow page and the Room hold card, at the width the drawing was made
 * at, so the built surface can be put beside `2-act-on-it.html` frame by frame.
 *
 * The Workflow here is the captured "Composable title search": complete, three
 * steps finished, two runs, $3.55 against a $4.50 limit. The Room is the
 * captured CSV Summariser, paused with two members that stopped to ask.
 * Nothing is live; every value is a fixture.
 */

import { AppContext, type AppContextValue } from '@sero-ai/app-runtime';
import type { Loop, LoopRunSummary, LoopSummary } from '../../shared/types';
import type { PersistedRoom } from '../../shared/room-types';
import { previewLoop } from './fixture';
import { LoopSettingsLine } from '../components/LoopSettingsLine';
import { LoopStateLine } from '../components/LoopStateLine';
import { PlanView } from '../components/PlanView';
import { RoomHoldCard } from '../components/RoomHoldCard';
import type { HoldMember } from '../lib/room-hold';
import { RoomTopBar } from '../components/RoomTopBar';

/**
 * The plan reads the model list and the subagent context through the host
 * bridge, which throws outside the Sero shell rather than reporting an empty
 * result. The harness has no shell, so it gets a bridge that offers neither
 * capability: both hooks check for it first, so each reports it is unavailable
 * and the plan renders every step with its controls on their defaults.
 *
 * `getSeroApi` recognises a bridge by these two keys. It never replaces a real
 * one, so the file is harmless if a preview is opened inside Sero.
 */
const bridge = globalThis as { sero?: unknown };
bridge.sero ??= { appState: {}, appAgent: {} };

const days = (count: number): string => new Date(Date.now() - count * 86_400_000).toISOString();

const APP_CONTEXT = {
  appId: 'orchestrator',
  workspaceId: 'ws-1',
  workspacePath: '/repos/reading-tracker-resilience-01',
  stateFilePath: '/repos/reading-tracker-resilience-01/.sero/apps/orchestrator/index.json',
} as AppContextValue;

/** The captured Workflow: manual, workspace root, every limit set. */
const WORKFLOW: Loop = {
  ...previewLoop,
  id: 'composable-title-search',
  title: 'Composable title search',
  status: 'complete',
  summary: 'Add an accessible composable title search to the reading tracker.',
  limits: { ...previewLoop.limits, maxAttemptsTotal: 50, maxWallClockMs: 30 * 60_000, maxConcurrentSteps: 1, maxCostUsd: 4.5 },
  planningUsage: { costUsd: 0.42 },
};

const RUNS: LoopRunSummary[] = [
  { usage: { costUsd: 2.13 } } as LoopRunSummary,
  { usage: { costUsd: 1 } } as LoopRunSummary,
];

const SUMMARY: LoopSummary = {
  id: WORKFLOW.id,
  title: WORKFLOW.title,
  status: 'complete',
  progress: { total: 3, done: 3, running: false },
  lastRunAt: days(9),
} as unknown as LoopSummary;

/**
 * The Workflow page's header and plan: the state line, the labelled settings
 * line, then the steps with their Result rows.
 */
export function WorkflowPagePreview() {
  return (
    <AppContext.Provider value={APP_CONTEXT}>
      <div className="flex flex-col gap-4 p-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold">{WORKFLOW.title}</h1>
          <LoopStateLine loop={WORKFLOW} summary={SUMMARY} runCount={RUNS.length} />
          <p className="text-base text-muted-foreground">{WORKFLOW.summary}</p>
          <LoopSettingsLine loop={WORKFLOW} runs={RUNS} busy={false} onAction={() => undefined} />
        </header>
        <PlanView loop={WORKFLOW} onAction={() => undefined} />
      </div>
    </AppContext.Provider>
  );
}

const MEMBERS: HoldMember[] = [
  {
    id: 'm-1',
    displayName: 'Morgan',
    statusAt: days(9),
    statusDetail: 'Assisted recovery merge could not be attempted: the harness rejected `git merge --ff-only 53f31d…` with `Mutating git commands are managed by Sero, and this session has no git command of its own.` Current worktree remains at c2739d3. Please apply the supplied immutable snapshot through the harness.',
  },
  {
    id: 'm-2',
    displayName: 'Riley',
    statusAt: days(9),
    statusDetail: 'System-directed recovery is blocked in the Riley worktree: clean status confirmed, but `git merge --ff-only 53f31d677ab895ba9422b8c013b08018da1890ee` is rejected by the harness because mutating git commands are managed by Sero and this session has no git command. Please apply the immutable snapshot.',
  },
];

const ROOM: PersistedRoom = {
  memberIds: ['m-1', 'm-2'],
  definition: {
    title: 'CSV Summariser Adversarial Validation',
    envelope: { maxWallClockMs: 3_600_000, maxCostUsd: 2, maxActiveTurns: 3, maxTokens: 1e9, maxRosterRevisions: 5 },
  },
  runtime: {
    status: 'paused',
    startedAt: days(9),
    endedAt: null,
    activeMs: 41 * 60_000,
    activeSince: null,
    activeMemberIds: [],
    usage: { costUsd: 0.31 },
    stopReason: {
      kind: 'awaiting-user',
      detail: 'Both members ask for the saved snapshot to be applied through the harness, because Sero manages git commands and their sessions have none.',
      at: days(9),
    },
    messageSequence: 0,
    timelineSequence: 0,
    appliedCommandIds: [],
    lastProgressAt: null,
  },
} as unknown as PersistedRoom;

/** The Room header with the hold card under it: each control exactly once. */
export function RoomHoldPreview() {
  return (
    <div className="flex flex-col border border-room-line">
      <RoomTopBar
        room={ROOM}
        view="timeline"
        busy={false}
        panelOpen={false}
        holding
        waitingForYou
        onTogglePanel={() => undefined}
        onBack={() => undefined}
        onView={() => undefined}
        onMessage={() => undefined}
        onPause={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
        onDelete={() => undefined}
      />
      <RoomHoldCard
        stopReason={ROOM.runtime.stopReason}
        members={MEMBERS}
        controls={{ message: true, resume: true, stop: true }}
        busy={false}
        onMessage={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />
    </div>
  );
}
