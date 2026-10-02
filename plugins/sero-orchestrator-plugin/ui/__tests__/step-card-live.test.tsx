// @vitest-environment jsdom

/**
 * A running step's live view, and a failed step's layout.
 *
 * The block is closed until the person opens it, an active-session step offers
 * no control (the chat shows that work), and a fan-out step shows one block per
 * running item, named by the item.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIMITS, DEFAULT_LOG_POLICY, DEFAULT_WORKSPACE_SETTINGS } from '../../shared/defaults';
import { StepCard } from '../components/StepCard';
import { fanOutView } from '../lib/fan-out-summary';
import type { Loop, LoopRun, StepAttempt, StepRuntimeState } from '../../shared/types';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

function attempt(overrides: Partial<StepAttempt> & { id: string; stepId: string }): StepAttempt {
  return {
    attemptNumber: 1,
    parentSessionId: 'sess',
    executionType: 'background-agent',
    status: 'running',
    observations: [],
    startedAt: '2026-09-10T12:00:00.000Z',
    ...overrides,
  };
}

interface StepSpec {
  id: string;
  title: string;
  execution?: Loop['plan']['steps'][number]['execution'];
  fanOut?: boolean;
  state?: StepRuntimeState;
  attempts?: StepAttempt[];
  activations?: LoopRun['stepActivations'];
}

/** A loop whose one step is whatever the test describes. */
function loopWith(spec: StepSpec): Loop {
  const run: LoopRun = {
    id: 'run-1',
    runNumber: 1,
    status: 'running',
    startedStepIds: [spec.id],
    stepAttempts: spec.attempts ?? [],
    recoveryDecisions: [],
    observations: [],
    startedAt: '2026-09-10T12:00:00.000Z',
    ...(spec.activations ? { stepActivations: spec.activations } : {}),
  };
  return {
    id: 'loop-1',
    workspaceId: 'ws-1',
    title: 'T',
    prompt: 'p',
    summary: 's',
    status: 'active',
    workspace: { ...DEFAULT_WORKSPACE_SETTINGS },
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: 'o',
      steps: [{
        id: spec.id,
        title: spec.title,
        instructions: 'Do it.',
        execution: spec.execution ?? { type: 'background-agent' },
        ...(spec.fanOut ? { fanOut: { itemsFrom: 'items', itemVariable: 'item', maxItems: 4 } } : {}),
      }],
    },
    runtime: {
      parentSessionId: 'sess',
      variables: {},
      stepStates: {
        [spec.id]: spec.state ?? { status: 'running', attempts: 1, updatedAt: '2026-09-10T12:00:00.000Z' },
      },
      workspace: {},
      activeRunId: run.id,
    },
    triggers: [],
    limits: { ...DEFAULT_LIMITS },
    logPolicy: { ...DEFAULT_LOG_POLICY },
    warnings: [],
    runs: [run],
    revisions: [],
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z',
  };
}

function render(loop: Loop, activeRun: LoopRun | null = loop.runs[0] ?? null) {
  // Production persists `loop.json` with its run history stripped
  // (`stripLoopForPersist`), so the step is handed the run rather than reading
  // it from the loop. Building the fixture the same way is the point of this
  // test: a step that searched `loop.runs` had no live view at all.
  const persisted: Loop = { ...loop, runs: [] };
  act(() => root.render(
    <StepCard
      step={persisted.plan.steps[0]}
      number={1}
      loop={persisted}
      numberOf={new Map([[persisted.plan.steps[0].id, 1]])}
      state={persisted.runtime.stepStates[persisted.plan.steps[0].id]}
      activeRun={activeRun}
      fanOut={fanOutView(activeRun ? [activeRun] : [], persisted.plan.steps[0].id)}
      groups={[]}
      toolCatalog={[]}
      agentCatalog={[]}
      onSetModel={() => {}}
      onSetTools={() => {}}
      onSetAgent={() => {}}
    />,
  ));
}

function eye(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('button[aria-label="Watch the agent for Repair the levels"]');
}

function blocks(): NodeListOf<Element> {
  return container.querySelectorAll('[data-slot="live-block"]');
}

async function openEye() {
  const button = eye();
  await act(async () => button?.click());
}

describe('a running step offers its live view', () => {
  it('offers the eye closed, and opens one block on request', async () => {
    const loop = loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      attempts: [attempt({ id: 'attempt-1', stepId: 'step-1', workerRunId: 'run-worker-1' })],
    });
    render(loop);

    expect(eye()).not.toBeNull();
    expect(eye()?.getAttribute('aria-expanded')).toBe('false');
    expect(blocks()).toHaveLength(0);

    await openEye();

    expect(eye()?.getAttribute('aria-expanded')).toBe('true');
    expect(blocks()).toHaveLength(1);
  });

  it('takes the run it is handed, and never the loop’s own run list', async () => {
    // The defect this pins: a step that searched `loop.runs` found an empty list
    // in production, so every running step lost its live view. Handing the run
    // in works; leaving it out must not fall back to the loop's list.
    const loop = loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      attempts: [attempt({ id: 'attempt-1', stepId: 'step-1', workerRunId: 'run-worker-1' })],
    });

    render(loop, null);
    expect(eye()).toBeNull();

    // Same loop, same run in `loop.runs`, but this time handed over.
    render(loop, loop.runs[0]);
    expect(eye()).not.toBeNull();
  });

  it('offers no control on a step that runs in the chat session', () => {
    render(loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      execution: {
        type: 'active-session',
        sessionTarget: { workspaceId: 'ws-1', strategy: 'most-recent-active', deliverAs: 'followUp', triggerTurn: true },
      },
    }));

    expect(eye()).toBeNull();
    expect(blocks()).toHaveLength(0);
  });

  it('offers no control on a step that is not running', () => {
    render(loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      state: { status: 'succeeded', attempts: 1, updatedAt: '2026-09-10T12:00:00.000Z' },
    }));

    expect(eye()).toBeNull();
  });

  it('shows one block per running fan-out item, named by the item', async () => {
    const loop = loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      fanOut: true,
      attempts: [
        attempt({ id: 'a1', stepId: 'step-1', workerRunId: 'run-worker-1' }),
        attempt({ id: 'a2', stepId: 'step-1', workerRunId: 'run-worker-2' }),
        attempt({ id: 'a3', stepId: 'step-1', status: 'completed', workerRunId: 'run-worker-3' }),
      ],
      activations: [
        { id: 'act-1', stepId: 'step-1', visitNumber: 1, status: 'running', startedAt: '2026-09-10T12:00:00.000Z', attemptIds: ['a1'], fanOut: { index: 0, key: 'level-1', item: 1 } },
        { id: 'act-2', stepId: 'step-1', visitNumber: 1, status: 'running', startedAt: '2026-09-10T12:00:00.000Z', attemptIds: ['a2'], fanOut: { index: 1, key: 'level-2', item: 2 } },
        { id: 'act-3', stepId: 'step-1', visitNumber: 1, status: 'succeeded', startedAt: '2026-09-10T12:00:00.000Z', attemptIds: ['a3'], fanOut: { index: 2, key: 'level-3', item: 3 } },
      ],
    });
    render(loop);

    await openEye();

    expect(blocks()).toHaveLength(2);
    expect(container.textContent).toContain('level-1');
    expect(container.textContent).toContain('level-2');
    expect(container.textContent).not.toContain('level-3');
  });

  it('shows the check between steps while the step stays running', async () => {
    const loop = loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      attempts: [attempt({ id: 'attempt-1', stepId: 'step-1', workerRunId: 'run-worker-1' })],
    });
    loop.runtime.liveCall = { kind: 'evaluator', runId: 'run-check-1', stepId: 'step-1' };
    render(loop);

    await openEye();

    expect(blocks()).toHaveLength(1);
    expect(container.textContent).toContain('checking the result');
  });
});

describe('a failed step', () => {
  it('carries Retry in the header and states its reason under the title', () => {
    const onRetry = vi.fn();
    const loop = loopWith({
      id: 'step-1',
      title: 'Repair the levels',
      state: {
        status: 'failed',
        attempts: 1,
        updatedAt: '2026-09-10T12:00:00.000Z',
        outcome: { status: 'failed', summary: 'Timed out while the build was running.' },
      },
    });
    act(() => root.render(
      <StepCard
        step={loop.plan.steps[0]}
        number={1}
        loop={loop}
        numberOf={new Map([['step-1', 1]])}
        state={loop.runtime.stepStates['step-1']}
        activeRun={loop.runs[0] ?? null}
        groups={[]}
        toolCatalog={[]}
        agentCatalog={[]}
        onSetModel={() => {}}
        onSetTools={() => {}}
        onSetAgent={() => {}}
        onRetry={onRetry}
      />,
    ));

    const header = container.firstElementChild?.firstElementChild;
    expect(header?.textContent).toContain('Failed');
    expect(header?.textContent).toContain('Retry');
    // The reason reads as one line under the title, with no label column.
    expect(container.textContent).toContain('Timed out while the build was running.');
    expect(container.textContent).not.toContain('Result');
    expect(eye()).toBeNull();
  });
});
