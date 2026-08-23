// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppState } from '@sero-ai/app-runtime';
import { DEFAULT_STATE } from '../../shared/defaults';
import { useOrchestratorNavigation, type OrchestratorView } from '../lib/orchestrator-navigation';

describe('useOrchestratorNavigation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    Reflect.deleteProperty(globalThis, '__sero_app_launch_params__');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(window, 'sero');
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('writes navigation and layout changes after reading a null state file', async () => {
    const write = vi.fn(async () => ({ ok: true as const, etag: 'e1' }));
    Reflect.set(window, 'sero', {
      appState: {
        read: vi.fn(async () => null),
        write,
        watch: vi.fn(async () => ({ data: null, etag: null })),
        unwatch: vi.fn(async () => undefined),
        onChange: vi.fn(() => () => undefined),
      },
      appAgent: {
        prompt: vi.fn(async () => ''),
        invokeTool: vi.fn(async () => ({ text: '', content: [], details: null, isError: false })),
      },
    });

    let navigate: ((view: OrchestratorView) => void) | null = null;
    let resize: (() => void) | null = null;

    function Probe() {
      const [state, updateState, ready] = useAppState(DEFAULT_STATE);
      const runtime = { state, updateState, ready };
      [, navigate] = useOrchestratorNavigation(runtime);
      resize = () => updateState((previous) => ({
        ...previous,
        ui: {
          ...previous.ui,
          roomPanelLayouts: {
            ...previous.ui?.roomPanelLayouts,
            roster: { ...previous.ui?.roomPanelLayouts?.roster, 'room-1': 35 },
          },
        },
      }));
      return null;
    }

    await act(async () => {
      root.render(
        <AppProvider
          value={{
            appId: 'orchestrator',
            workspaceId: 'workspace-1',
            workspacePath: '/workspace',
            stateFilePath: '/workspace/state.json',
            navigation: { navigate: vi.fn() },
          }}
        >
          <Probe />
        </AppProvider>,
      );
      await Promise.resolve();
    });
    expect(write).not.toHaveBeenCalled();

    await act(async () => navigate?.({ mode: 'rooms', roomId: 'room-1' }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith('/workspace/state.json', expect.objectContaining({
      ui: expect.objectContaining({ navigationViewId: 'rooms/room-1' }),
    }), null);

    await act(async () => resize?.());
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith('/workspace/state.json', expect.objectContaining({
      ui: expect.objectContaining({
        navigationViewId: 'rooms/room-1',
        roomPanelLayouts: { roster: { 'room-1': 35 } },
      }),
    }), 'e1');
  });
});
