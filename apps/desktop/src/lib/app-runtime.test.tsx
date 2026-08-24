// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppProvider,
  getRuntimeWidgets,
  getSeroApi,
  onWidgetRegistryChange,
  registerWidget,
  useAppState,
  useAppTools,
  useWidgetRegistration,
} from '@sero-ai/app-runtime';

interface AppStateApiMock {
  read: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  watch: ReturnType<typeof vi.fn>;
  unwatch: ReturnType<typeof vi.fn>;
  onChange: ReturnType<typeof vi.fn>;
}

function installSeroBridge(appState: AppStateApiMock) {
  Reflect.set(window, 'sero', {
    appState,
    appAgent: {
      prompt: vi.fn(async () => ''),
      invokeTool: vi.fn(async () => ({
        text: '',
        content: [],
        details: null,
        isError: false,
      })),
    },
  });
}

function RuntimeWidgetComponent() {
  return null;
}

describe('app-runtime shared seams', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
    root = null;
    container = null;
    Reflect.deleteProperty(window, 'sero');
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('throws a clear error when the Sero preload bridge is missing', () => {
    expect(() => getSeroApi()).toThrow('[app-runtime] window.sero not available — must run inside Sero shell');
  });

  it('reports when the initial app-state read is complete', async () => {
    let ready = false;
    let updateState: ((updater: (prev: { count: number }) => { count: number }) => void) | null = null;
    let finishWatch: ((value: { data: { count: number } | null; etag: string | null }) => void) | null = null;
    const appState = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => ({ ok: true as const, etag: 'e1' })),
      watch: vi.fn(() => new Promise<{ data: { count: number } | null; etag: string | null }>((resolve) => {
        finishWatch = resolve;
      })),
      unwatch: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    };
    installSeroBridge(appState);

    function Probe() {
      const [, setState, stateReady] = useAppState({ count: 0 });
      ready = stateReady;
      updateState = setState;
      return null;
    }

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'runtime-test', workspaceId: 'global', workspacePath: '/tmp', stateFilePath: '/tmp/state.json' }}>
          <Probe />
        </AppProvider>,
      );
    });
    expect(ready).toBe(false);

    await act(async () => {
      finishWatch?.({ data: null, etag: null });
      await Promise.resolve();
    });
    expect(ready).toBe(true);

    await act(async () => updateState?.((previous) => ({ count: previous.count + 1 })));
    expect(appState.write).toHaveBeenCalledWith('/tmp/state.json', { count: 1 }, null);
  });

  it('reconciles optimistic app-state writes back to disk on write failure', async () => {
    let latestState = 0;
    let updateState: ((updater: (prev: { count: number }) => { count: number }) => void) | null = null;
    let rejectWrite: ((error: Error) => void) | null = null;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const appState = {
      read: vi.fn(async () => ({ count: 0 })),
      write: vi.fn(() => new Promise<never>((_resolve, reject) => {
        rejectWrite = reject;
      })),
      watch: vi.fn(async () => ({ data: { count: 0 }, etag: 'e0' })),
      unwatch: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    };
    installSeroBridge(appState);

    function Probe() {
      const [state, setState] = useAppState({ count: 0 });
      latestState = state.count;
      updateState = setState;
      return null;
    }

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'runtime-test', workspaceId: 'global', workspacePath: '/tmp', stateFilePath: '/tmp/state.json' }}>
          <Probe />
        </AppProvider>,
      );
    });

    expect(latestState).toBe(0);
    expect(appState.watch).toHaveBeenCalledWith('/tmp/state.json');

    await act(async () => {
      updateState?.((previous) => previous);
    });
    expect(appState.write).not.toHaveBeenCalled();

    await act(async () => {
      updateState?.((prev) => ({ count: prev.count + 1 }));
    });

    expect(appState.write).toHaveBeenCalledWith('/tmp/state.json', { count: 1 }, 'e0');
    expect(latestState).toBe(1);

    await act(async () => {
      rejectWrite?.(new Error('disk offline'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(warnSpy).toHaveBeenCalledWith('[app-runtime] Failed to persist app state for /tmp/state.json', expect.any(Error));
    expect(appState.read).toHaveBeenCalledWith('/tmp/state.json');
    expect(latestState).toBe(0);

    warnSpy.mockRestore();
  });

  it('keeps default object fields when stored app state is partial or malformed', async () => {
    let latestState: { display: string; history: unknown[]; meta: { ready: boolean }; extra?: string } | null = null;
    const appState = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      watch: vi.fn(async () => ({ data: { display: 42, history: null, meta: {}, extra: 'kept' }, etag: 'e0' })),
      unwatch: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    };
    installSeroBridge(appState);

    function Probe() {
      const [state] = useAppState({ display: '0', history: [], meta: { ready: false } });
      latestState = state;
      return null;
    }

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'runtime-test', workspaceId: 'global', workspacePath: '/tmp', stateFilePath: '/tmp/state.json' }}>
          <Probe />
        </AppProvider>,
      );
    });

    expect(latestState).toEqual({ display: '0', history: [], meta: { ready: false }, extra: 'kept' });
  });

  it('invokes app-local tools through the generic appAgent bridge', async () => {
    let runTool: ((toolName: string, params?: Record<string, unknown>) => Promise<unknown>) | null = null;
    const invokeTool = vi.fn(async () => ({
      text: '{"ok":true}',
      content: [{ type: 'text', text: '{"ok":true}' }],
      details: { ok: true },
      isError: false,
    }));

    const appState = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      watch: vi.fn(async () => null),
      unwatch: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    };
    installSeroBridge(appState);
    const sero = Reflect.get(window, 'sero') as { appAgent: { invokeTool: typeof invokeTool } };
    sero.appAgent.invokeTool = invokeTool;

    function Probe() {
      const appTools = useAppTools();
      runTool = appTools.run;
      return null;
    }

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'runtime-tools', workspaceId: 'global', workspacePath: '/tmp', stateFilePath: '/tmp/tools-state.json' }}>
          <Probe />
        </AppProvider>,
      );
    });

    expect(runTool).not.toBeNull();
    const result = await runTool!('plugin_ping', { value: 42 });

    expect(invokeTool).toHaveBeenCalledWith('runtime-tools', 'global', 'plugin_ping', { value: 42 });
    expect(result).toEqual({
      text: '{"ok":true}',
      content: [{ type: 'text', text: '{"ok":true}' }],
      details: { ok: true },
      isError: false,
    });
  });

  it('does not republish runtime widgets for equivalent inline size objects and keeps them sticky after unmount', async () => {
    const appState = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      watch: vi.fn(async () => null),
      unwatch: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    };
    installSeroBridge(appState);

    const changes: number[] = [];
    const unsubscribe = onWidgetRegistryChange(() => {
      changes.push(getRuntimeWidgets().length);
    });

    function WidgetProbe({ description }: { description: string }) {
      useWidgetRegistration({
        widgetId: 'runtime-widget',
        name: 'Runtime Widget',
        component: RuntimeWidgetComponent,
        defaultSize: { w: 2, h: 2 },
        minSize: { w: 1, h: 1 },
        description,
      });
      return null;
    }

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'runtime-widget-app', workspaceId: 'global', workspacePath: '/tmp', stateFilePath: '/tmp/widget-state.json' }}>
          <WidgetProbe description="stable" />
        </AppProvider>,
      );
    });

    expect(changes).toEqual([1]);

    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'runtime-widget-app', workspaceId: 'global', workspacePath: '/tmp', stateFilePath: '/tmp/widget-state.json' }}>
          <WidgetProbe description="stable" />
        </AppProvider>,
      );
    });

    expect(changes).toEqual([1]);
    expect(getRuntimeWidgets().some((widget) => widget.appId === 'runtime-widget-app' && widget.widgetId === 'runtime-widget')).toBe(true);

    await act(async () => {
      root?.unmount();
    });
    root = null;

    expect(getRuntimeWidgets().some((widget) => widget.appId === 'runtime-widget-app' && widget.widgetId === 'runtime-widget')).toBe(true);

    unsubscribe();
    registerWidget({
      appId: 'runtime-widget-app',
      widgetId: 'runtime-widget',
      name: 'Runtime Widget',
      component: RuntimeWidgetComponent,
      defaultSize: { w: 2, h: 2 },
      minSize: { w: 1, h: 1 },
      description: 'stable',
    })();
  });
});
