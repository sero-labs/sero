// @vitest-environment jsdom

/**
 * A Workflow or Room row, the Room page header and a running step print the
 * same observed work: the open call, its measured wait and the last activity.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedbackSummary, WorkFeedback } from '@sero-ai/common';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY, DEFAULT_WORKSPACE_SETTINGS } from '../../shared/defaults';
import type { PersistedRoom, RoomSummary } from '../../shared/room-types';
import type { Loop, LoopRun, LoopSummary } from '../../shared/types';
import { RoomTopBar } from '../components/RoomTopBar';
import { RoomsOverview } from '../components/RoomsOverview';
import { StepCard } from '../components/StepCard';
import { WorkflowsList } from '../components/WorkflowsList';
import { roomActivity } from '../lib/room-activity';
import { NO_WORK, WorkViewContext, type WorkView } from '../lib/use-work-activity';

const NOW = Date.parse('2026-10-03T10:00:00.000Z');
const ago = (seconds: number): string => new Date(NOW - seconds * 1000).toISOString();
const EPOCH = '2026-10-03T09:00:00.000Z';

const held = vi.hoisted(() => ({ work: new Map<string, FeedbackSummary>() }));

vi.mock('../lib/use-work-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/use-work-activity')>()),
  useWorkActivity: () => held.work,
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  held.work = new Map();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

const feedback = (current: FeedbackSummary['current'], over: Partial<FeedbackSummary> = {}): FeedbackSummary => ({
  activeCount: current.length, current, lastActivityAt: ago(8), contactObservedAt: ago(1), ...over,
});

function roomSummary(over: Partial<RoomSummary> = {}): RoomSummary {
  return {
    id: 'room-1', title: 'Build the synth', status: 'running', memberCount: 2, activeMemberCount: 2, costUsd: 0.83, maxCostUsd: 2,
    maxWallClockMs: 30 * 60_000, activeMs: 10 * 60_000, activeSince: ago(120), startedAt: ago(3600), updatedAt: ago(30),
    members: [{ id: 'm1', name: 'Adversary', isConductor: false }, { id: 'm2', name: 'Conductor', isConductor: true }],
    attentionCount: 0, deliveredAt: null, deliveryRef: null, ...over,
  } as RoomSummary;
}

describe('a Room row and its page', () => {
  it('prints the same working time on the row and in the header', () => {
    // Ten minutes banked and two open: both read twelve.
    act(() => root.render(<RoomsOverview rooms={[roomSummary()]} onOpenRoom={() => {}} onNew={() => {}} />));
    expect(host.textContent).toContain('12 min of 30 min active');

    const room = {
      definition: {
        title: 'Build the synth',
        envelope: { maxWallClockMs: 30 * 60_000, maxCostUsd: 2, maxActiveTurns: 3, maxTokens: 1e9, maxRosterRevisions: 5 },
      },
      runtime: {
        status: 'running', startedAt: ago(3600), endedAt: null, activeMs: 10 * 60_000, activeSince: ago(120),
        activeMemberIds: [], usage: { costUsd: 0.83 }, stopReason: null, messageSequence: 0, timelineSequence: 0,
        appliedCommandIds: [], lastProgressAt: null,
      },
      members: [],
    } as unknown as PersistedRoom;
    act(() => root.render(
      <RoomTopBar
        room={room} view="timeline" busy={false} panelOpen={false} holding={false}
        onTogglePanel={() => {}} onBack={() => {}} onView={() => {}} onMessage={() => {}}
        onPause={() => {}} onResume={() => {}} onStop={() => {}} onDelete={() => {}}
      />,
    ));
    expect(host.textContent).toContain('12m');
  });

  it('shows the row\'s current work and freshness in the page header, from the same helper', () => {
    const work = feedback([{ key: 'm1', owner: 'Adversary', wait: { kind: 'tool', toolName: 'bash', since: null } }]);
    const activity = roomActivity(roomSummary(), EPOCH, work, NOW);
    held.work = new Map([['room-1', work]]);

    act(() => root.render(<RoomsOverview rooms={[roomSummary()]} onOpenRoom={() => {}} onNew={() => {}} />));
    const row = host.textContent ?? '';

    const room = { definition: { title: 'Build the synth', envelope: { maxWallClockMs: 30 * 60_000, maxCostUsd: 2 } }, runtime: { status: 'running', startedAt: ago(3600), endedAt: null, activeMs: 0, activeSince: null, usage: { costUsd: 0 } }, members: [] } as unknown as PersistedRoom;
    act(() => root.render(
      <RoomTopBar
        room={room} view="timeline" busy={false} panelOpen={false} holding={false} activity={activity}
        onTogglePanel={() => {}} onBack={() => {}} onView={() => {}} onMessage={() => {}}
        onPause={() => {}} onResume={() => {}} onStop={() => {}} onDelete={() => {}}
      />,
    ));
    const header = host.textContent ?? '';

    expect(activity.work).toBe('Adversary · bash');
    expect(row).toContain('Working · Adversary · bash');
    expect(header).toContain('Adversary · bash');
    expect(header).toContain('Last activity 8s ago');
  });

  it('reads Last known on the page too when a saved running Room has no contact', () => {
    const summary = roomSummary();
    const activity = roomActivity(summary, EPOCH, undefined, NOW);
    const room = { definition: { title: 'Build the synth', envelope: { maxWallClockMs: 30 * 60_000, maxCostUsd: 2 } }, runtime: { status: 'running', startedAt: ago(3600), endedAt: null, activeMs: 0, activeSince: null, usage: { costUsd: 0 } }, members: [] } as unknown as PersistedRoom;

    act(() => root.render(
      <RoomTopBar
        room={room} view="timeline" busy={false} panelOpen={false} holding={false} activity={activity}
        onTogglePanel={() => {}} onBack={() => {}} onView={() => {}} onMessage={() => {}}
        onPause={() => {}} onResume={() => {}} onStop={() => {}} onDelete={() => {}}
      />,
    ));

    expect(host.textContent).toContain('Last known');
    expect(host.textContent).toContain('cannot be confirmed');
  });
});

describe('a Workflow row', () => {
  const summary = (over: Partial<LoopSummary> = {}): LoopSummary => ({
    id: 'loop-1', title: 'Check sound and controls', status: 'active', summary: '', prompt: '',
    createdAt: ago(9000), updatedAt: ago(100), progress: { total: 4, done: 1, running: true },
    liveRun: { runId: 'r1', startedAt: new Date(NOW).toISOString(), reportedAt: new Date(NOW).toISOString() }, ...over,
  });

  it('shows the step, the quiet request with its measured wait, and the last activity', () => {
    held.work = new Map([['loop-1', feedback([{ key: 'attempt:a1', owner: 'agent', subject: 'Sweep the filter', wait: { kind: 'request', since: ago(47) } }])]]);

    act(() => root.render(<WorkflowsList loops={[summary()]} query="" onQueryChange={() => {}} onSelect={() => {}} onNew={() => {}} />));

    const text = host.textContent ?? '';
    expect(text).toContain('Working · Step 2 of 4 · waiting for the model · 0:47');
    expect(text).toContain('Last activity 8s ago');
  });

  it('shows no wait duration when the request start was not measured', () => {
    held.work = new Map([['loop-1', feedback([{ key: 'attempt:a1', owner: 'agent', wait: { kind: 'request', since: null } }])]]);

    act(() => root.render(<WorkflowsList loops={[summary()]} query="" onQueryChange={() => {}} onSelect={() => {}} onNew={() => {}} />));

    expect(host.textContent).toContain('Working · Step 2 of 4 · waiting for the model');
    expect(host.textContent).not.toContain('waiting for the model · ');
  });
});

describe('a running step', () => {
  const attempt = (id: string) => ({
    id, stepId: 'step-1', attemptNumber: 1, parentSessionId: 's', executionType: 'background-agent' as const,
    status: 'running' as const, observations: [], startedAt: ago(60), workerRunId: `run-${id}`,
  });

  const fanOutLoop = (): { loop: Loop; run: LoopRun } => {
    const run = {
      id: 'run-1', runNumber: 1, status: 'running', startedStepIds: ['step-1'],
      stepAttempts: [attempt('a1'), attempt('a2')], recoveryDecisions: [], observations: [], startedAt: ago(60),
      stepActivations: [
        { id: 'x1', stepId: 'step-1', visitNumber: 1, status: 'running', startedAt: ago(60), attemptIds: ['a1'], fanOut: { index: 0, key: 'level-1', item: 1 } },
        { id: 'x2', stepId: 'step-1', visitNumber: 1, status: 'running', startedAt: ago(60), attemptIds: ['a2'], fanOut: { index: 1, key: 'level-2', item: 2 } },
      ],
    } as unknown as LoopRun;
    const loop = {
      id: 'loop-1', workspaceId: 'ws-1', title: 'T', prompt: 'p', summary: 's', status: 'active',
      workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
      plan: { schemaVersion: 1, revision: 0, objective: 'o', steps: [{ id: 'step-1', title: 'Repair the levels', instructions: 'Do it.', execution: { type: 'background-agent' }, fanOut: { itemsFrom: 'items', itemVariable: 'item', maxItems: 4 } }] },
      runtime: { parentSessionId: 's', variables: {}, stepStates: { 'step-1': { status: 'running', attempts: 1, updatedAt: ago(60) } }, workspace: {}, activeRunId: 'run-1' },
      triggers: [], limits: { ...DEFAULT_LIMITS }, logPolicy: { ...DEFAULT_LOG_POLICY }, warnings: [], runs: [], revisions: [],
      createdAt: ago(60), updatedAt: ago(60),
    } as unknown as Loop;
    return { loop, run };
  };

  const snapshot = (attemptId: string, wait: WorkFeedback['wait']): WorkFeedback => ({
    key: `attempt:${attemptId}`, kind: 'workflow-attempt', owner: 'agent', scope: { appId: 'orchestrator', workspaceId: 'ws-1', workId: 'loop-1', attemptId },
    epoch: EPOCH, revision: 1, turnId: 't', attached: true, wait, openCalls: 1, lastActivityAt: ago(8), contactObservedAt: ago(1), terminal: null,
  });

  it('shows each fan-out item its own wait once the items are opened', () => {
    const { loop, run } = fanOutLoop();
    const view: WorkView = {
      ...NO_WORK, epoch: EPOCH,
      byAttempt: new Map([
        ['a1', snapshot('a1', { kind: 'request', since: ago(47) })],
        ['a2', snapshot('a2', { kind: 'tool', toolName: 'bash', since: ago(12) })],
      ]),
    };

    act(() => root.render(
      <WorkViewContext.Provider value={view}>
        <StepCard
          step={loop.plan.steps[0]} number={1} loop={loop} numberOf={new Map([['step-1', 1]])}
          state={loop.runtime.stepStates['step-1']} activeRun={run} fanOut={{ total: 2, succeeded: 0, failed: 0, running: 2, skipped: 0, items: [
            { key: 'level-1', status: 'running', runId: 'run-a1', attemptId: 'a1' },
            { key: 'level-2', status: 'running', runId: 'run-a2', attemptId: 'a2' },
          ] }}
          groups={[]} toolCatalog={[]} agentCatalog={[]} onSetModel={() => {}} onSetTools={() => {}} onSetAgent={() => {}}
        />
      </WorkViewContext.Provider>,
    ));
    act(() => host.querySelector<HTMLButtonElement>('button[aria-expanded="false"][class*="justify-between"]')?.click());

    const items = [...host.querySelectorAll('li')].map((item) => item.textContent ?? '');
    expect(items[0]).toContain('level-1');
    expect(items[0]).toContain('waiting for the model · 0:47');
    expect(items[1]).toContain('level-2');
    expect(items[1]).toContain('bash · 0:12');
  });

  it('adds nothing to a step no producer reported', () => {
    const { loop, run } = fanOutLoop();

    act(() => root.render(
      <StepCard
        step={loop.plan.steps[0]} number={1} loop={loop} numberOf={new Map([['step-1', 1]])}
        state={loop.runtime.stepStates['step-1']} activeRun={run}
        groups={[]} toolCatalog={[]} agentCatalog={[]} onSetModel={() => {}} onSetTools={() => {}} onSetAgent={() => {}}
      />,
    ));

    expect(host.textContent).not.toContain('waiting for the model');
    expect(host.textContent).not.toContain('Last activity');
  });
});
