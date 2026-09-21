// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '@sero-ai/app-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../shared/defaults';
import { previewLoop } from '../__preview__/fixture';
import { LoopDetail } from '../components/LoopDetail';
import { OrchestratorStateContext } from '../lib/orchestrator-state';
import type { Loop } from '../../shared/types';

vi.mock('../components/PlanMap', () => ({ PlanMap: () => <div>Map content</div> }));
vi.mock('../components/PlanView', () => ({ PlanView: () => <div>Details content</div> }));
// The page watches files on disk; this test is about what the page says once
// they are read, so every watch answers with its own fallback.
vi.mock('../lib/use-watched-json', () => ({
  useWatchedJson: (_path: string | null, fallback: unknown) => fallback,
}));

const openSeroFile = vi.fn(async (_workspaceId: string, _path: string) => true);
vi.mock('@sero-ai/app-runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sero-ai/app-runtime')>()),
  openSeroFile: (workspaceId: string, path: string) => openSeroFile(workspaceId, path),
}));

let container: HTMLDivElement;
let root: Root;

function render(loop: Loop) {
  const tree: ReactNode = (
    <AppProvider value={{
      appId: 'orchestrator',
      workspaceId: 'workspace-2',
      workspacePath: '/workspace-2',
      stateFilePath: '/workspace-2/state.json',
      profilePreferences: { values: {}, set: () => {} },
    }}>
      <OrchestratorStateContext.Provider value={{ state: DEFAULT_STATE, updateState: () => {}, ready: true }}>
        <LoopDetail
          loop={loop}
          summary={null}
          busy={false}
          onAction={() => {}}
          onDispatch={async () => null}
          stateDir="/workspace-2/orchestrator"
          libraryDir="/workspace-2/library"
          libraryIndex={{ version: 1, entries: [] }}
          onBack={() => {}}
        />
      </OrchestratorStateContext.Provider>
    </AppProvider>
  );
  act(() => root.render(tree));
}

/** The completed loop whose own run recorded this reason. */
const COMPLETION_REASON = 'FOV_RADIUS and the matching FOV default are 3.';

function completed(): Loop {
  return {
    ...previewLoop,
    status: 'complete',
    runtime: { ...previewLoop.runtime, completion: { status: 'complete', reason: COMPLETION_REASON } },
  } as unknown as Loop;
}

function stopped(): Loop {
  return {
    ...previewLoop,
    status: 'blocked',
    runtime: { ...previewLoop.runtime, block: { kind: 'management-limit', reason: 'reached max cost ($1.2)', createdAt: 't', limit: 'maxCostUsd' } },
  } as unknown as Loop;
}

function blockedAtStep(): Loop {
  const step = previewLoop.plan.steps[0];
  return {
    ...previewLoop,
    status: 'blocked',
    runtime: {
      ...previewLoop.runtime,
      block: { kind: 'recovery-block', reason: 'the reviewer could not reach the host', createdAt: 't', sourceStepId: step.id },
    },
  } as unknown as Loop;
}

const resultRow = () => container.querySelector('[data-result]');
const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

describe('a Workflow\'s ending', () => {
  it('leads with the reason the run recorded, above the settings', () => {
    render(completed());
    expect(resultRow()?.getAttribute('data-result')).toBe('complete');
    expect(resultRow()?.textContent).toContain(COMPLETION_REASON);
    // The card that led with a status word the state line already carries is gone.
    expect(container.textContent).not.toContain('Stopped (complete)');
  });

  it('prints a limit\'s own reason once, and keeps the whole-loop recovery', () => {
    render(stopped());
    expect(resultRow()?.getAttribute('data-result')).toBe('stopped');
    expect(resultRow()?.textContent).toContain('reached max cost ($1.2)');
    // Once on the page, not once per card.
    expect(occurrences(container.textContent ?? '', 'reached max cost ($1.2)')).toBe(1);
    expect(container.textContent).not.toContain('Stopped (blocked)');
    // Restart is still reachable, from the controls that already offered it.
    const labels = Array.from(container.querySelectorAll('button')).map((button) => button.textContent);
    expect(labels.some((label) => label?.includes('Restart'))).toBe(true);
  });

  it('names the step that blocked the run, and still carries the result row', () => {
    render(blockedAtStep());
    const step = previewLoop.plan.steps[0];
    expect(resultRow()?.textContent).toContain('the reviewer could not reach the host');
    // One statement names the step, beside the Retry control that acts on it.
    expect(container.textContent).toContain(`Blocked at “${step.title}”`);
    expect(occurrences(container.textContent ?? '', 'Blocked at')).toBe(1);
  });

  it('says the work ended without a recorded reason rather than inventing one', () => {
    const loop = { ...previewLoop, status: 'complete' } as Loop;
    render(loop);
    expect(resultRow()?.textContent).toContain('The Workflow ended without recording a reason.');
  });

  it('shows no result row while the work is still running', () => {
    render(previewLoop);
    expect(resultRow()).toBeNull();
  });
});

describe('the objective and the request that started it', () => {
  it('opens the full request from the objective, and states the objective once', () => {
    render(previewLoop);
    const objective = container.textContent ?? '';
    expect(occurrences(objective, previewLoop.plan.objective!)).toBe(1);
    expect(container.textContent).not.toContain(previewLoop.prompt);

    act(() => (container.querySelector('[aria-label="Show the request"]') as HTMLButtonElement).click());

    expect(container.textContent).toContain(previewLoop.prompt);
    // Opening the request does not restate the objective.
    expect(occurrences(container.textContent ?? '', previewLoop.plan.objective!)).toBe(1);
  });

  it('still reaches the request when no objective was recorded', () => {
    const loop = { ...previewLoop, plan: { ...previewLoop.plan, objective: undefined } } as unknown as Loop;
    render(loop);
    expect(container.textContent).toContain('No objective was recorded');

    act(() => (container.querySelector('[aria-label="Show the request"]') as HTMLButtonElement).click());

    expect(container.textContent).toContain(previewLoop.prompt);
  });
});
