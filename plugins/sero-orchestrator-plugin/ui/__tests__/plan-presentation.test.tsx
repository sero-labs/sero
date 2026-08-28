// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '@sero-ai/app-runtime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STATE } from '../../shared/defaults';
import { previewLoop } from '../__preview__/fixture';
import { PlanPresentation } from '../components/PlanPresentation';
import { OrchestratorStateContext } from '../lib/orchestrator-state';

vi.mock('../components/PlanMap', () => ({ PlanMap: () => <div>Map content</div> }));
vi.mock('../components/PlanView', () => ({ PlanView: () => <div>Details content</div> }));

describe('PlanPresentation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('uses and updates the profile-wide view selection', async () => {
    const setPreference = vi.fn();
    await act(async () => root.render(
      <AppProvider value={{
        appId: 'orchestrator',
        workspaceId: 'workspace-2',
        workspacePath: '/workspace-2',
        stateFilePath: '/workspace-2/state.json',
        profilePreferences: {
          values: { planPresentationMode: 'map', planStepsPerRow: 3 },
          set: setPreference,
        },
      }}>
        <OrchestratorStateContext.Provider value={{
          state: DEFAULT_STATE,
          updateState: () => {},
          ready: true,
        }}>
          <PlanPresentation loop={previewLoop} onAction={() => {}} />
        </OrchestratorStateContext.Provider>
      </AppProvider>,
    ));

    expect(container.textContent).toContain('Map content');
    const label = [...container.querySelectorAll('[id]')]
      .find((entry) => entry.textContent === 'Steps per row');
    const slider = container.querySelector<HTMLElement>('[role="slider"]');
    expect(label?.id).toBeTruthy();
    expect(slider?.getAttribute('aria-labelledby')).toBe(label?.id);
    expect(slider?.getAttribute('aria-valuenow')).toBe('3');
    await act(async () => slider?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
    })));
    expect(setPreference).toHaveBeenCalledWith('planStepsPerRow', 2);
    const details = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Details'));
    if (!details) throw new Error('Details control not found');
    await act(async () => details.click());
    expect(setPreference).toHaveBeenCalledWith('planPresentationMode', 'details');
  });
});
