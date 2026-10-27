// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, useAppState } from '@sero-ai/app-runtime';
import { DEFAULT_STATE } from '../../shared/defaults';
import { useOrchestratorNavigation, orchestratorViewId, type OrchestratorView } from '../lib/orchestrator-navigation';

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

  it('keeps history working after a same-route no-op and waits for a different route acknowledgement', async () => {
    let go: (view: OrchestratorView) => void;
    const hostNavigate = vi.fn(); // The actual shell emits nothing for a same-route request.
    function Probe() {
      const [view, navigate] = useOrchestratorNavigation({ state: DEFAULT_STATE, updateState: () => {}, ready: true });
      go = navigate;
      return <span>{orchestratorViewId(view)}</span>;
    }
    const render = async (viewId: string) => act(async () => root.render(
      <AppProvider value={{ appId: 'orchestrator', workspaceId: 'workspace-1', workspacePath: '/workspace', stateFilePath: '/workspace/state.json', navigation: { viewId, navigate: hostNavigate } }}><Probe /></AppProvider>,
    ));
    await render('workflows/loop-1');
    await act(async () => go({ mode: 'detail', loopId: 'loop-1' }));
    await render('home');
    expect(container.textContent).toBe('home');
    await render('workflows/loop-1');
    expect(container.textContent).toBe('workflows/loop-1');
    await act(async () => go({ mode: 'rooms', roomId: 'room-1' }));
    await render('home'); // A stale shell route must not replace the pending request.
    expect(container.textContent).toBe('rooms/room-1');
    await render('rooms/room-1');
    await render('home');
    expect(container.textContent).toBe('home');
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

  it('replaces the entry the shell opened on, so one Back leaves the app', async () => {
    const write = vi.fn(async () => ({ ok: true as const, etag: 'e1' }));
    const navigate = vi.fn();
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
    // The Orchestrator is opened on a Workflow while the shell remembers the
    // page it last showed in this workspace.
    Reflect.set(globalThis, '__sero_app_launch_params__', new Map([['orchestrator', { loopId: 'loop-1' }]]));

    function Probe() {
      const [state, updateState, ready] = useAppState(DEFAULT_STATE);
      const [view] = useOrchestratorNavigation({ state, updateState, ready });
      return <span>{view.mode === 'detail' ? view.loopId : view.mode}</span>;
    }

    await act(async () => {
      root.render(
        <AppProvider
          value={{
            appId: 'orchestrator',
            workspaceId: 'workspace-1',
            workspacePath: '/workspace',
            stateFilePath: '/workspace/state.json',
            navigation: { viewId: 'workflows/old-loop', navigate },
          }}
        >
          <Probe />
        </AppProvider>,
      );
      await Promise.resolve();
    });

    // One navigation, and it replaces: the launch does not add a second step.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('workflows/loop-1', { replace: true });
    expect(container.textContent).toBe('loop-1');
  });
});
