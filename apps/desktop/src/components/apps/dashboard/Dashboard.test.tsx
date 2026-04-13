// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroAppManifest } from '@/types/ipc';
import { useAppStore } from '@/stores/app';
import { useDashboardStore } from '@/stores/dashboard';

const gridWidthMocks = vi.hoisted(() => ({
  useGridWidth: vi.fn(),
}));

const runtimeWidgetMocks = vi.hoisted(() => ({
  useRuntimeWidgets: vi.fn(),
}));

vi.mock('./useGridWidth', () => ({
  useGridWidth: gridWidthMocks.useGridWidth,
}));

vi.mock('./useRuntimeWidgets', () => ({
  useRuntimeWidgets: runtimeWidgetMocks.useRuntimeWidgets,
}));

vi.mock('./AddWidgetDialog', () => ({
  AddWidgetDialog: ({ availableWidgets }: { availableWidgets: Array<unknown> }) => (
    <div data-testid="add-widget-dialog">widgets:{availableWidgets.length}</div>
  ),
}));

vi.mock('./DashboardWidget', () => ({
  DashboardWidget: ({ widget }: { widget: { instanceId: string } }) => (
    <div data-testid="dashboard-widget">{widget.instanceId}</div>
  ),
}));

vi.mock('react-grid-layout', () => ({
  GridLayout: ({ children, onLayoutChange, onDragStop, onResizeStop }: {
    children: ReactNode;
    onLayoutChange?: (layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void;
    onDragStop?: () => void;
    onResizeStop?: () => void;
  }) => (
    <div data-testid="grid-layout">
      <button
        type="button"
        onClick={() => onLayoutChange?.([{ i: 'widget-1', x: 1, y: 2, w: 2, h: 2 }])}
      >
        layout-change
      </button>
      <button type="button" onClick={() => onDragStop?.()}>
        drag-stop
      </button>
      <button type="button" onClick={() => onResizeStop?.()}>
        resize-stop
      </button>
      {children}
    </div>
  ),
}));

import { Dashboard } from './Dashboard';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createManifest(id: string, widgets: SeroAppManifest['widgets'] = []): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: `sero-ext://${id}/mf-manifest.json`,
    component: `${id}App`,
    devPort: 4100,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets,
  };
}

describe('Dashboard', () => {
  const initialAppState = useAppStore.getState();
  const initialDashboardState = useDashboardStore.getState();
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    gridWidthMocks.useGridWidth.mockReturnValue({
      containerRef: { current: null },
      width: 800,
    });
    runtimeWidgetMocks.useRuntimeWidgets.mockReturnValue([]);

    useAppStore.setState({
      ...initialAppState,
      apps: initialAppState.apps,
    }, true);
    useDashboardStore.setState(initialDashboardState, true);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    useAppStore.setState(initialAppState, true);
    useDashboardStore.setState(initialDashboardState, true);
    gridWidthMocks.useGridWidth.mockReset();
    runtimeWidgetMocks.useRuntimeWidgets.mockReset();
  });

  it('shows the empty state when no widgets are placed on the dashboard', async () => {
    await act(async () => {
      root?.render(<Dashboard />);
    });

    expect(container.textContent).toContain('Your dashboard is empty');
    expect(container.textContent).toContain('widgets:0');
  });

  it('renders the widget grid when widgets exist and width is available', async () => {
    useAppStore.setState({
      ...useAppStore.getState(),
      apps: [
        ...initialAppState.apps,
        {
          id: 'notes',
          label: 'Notes',
          icon: 'box',
          builtin: false,
          manifest: createManifest('notes', [
            {
              id: 'summary',
              name: 'Summary',
              component: 'NotesWidget',
              defaultSize: { w: 2, h: 2 },
            },
          ]),
        },
      ],
    }, true);
    useDashboardStore.setState({
      ...useDashboardStore.getState(),
      widgets: [
        {
          instanceId: 'widget-1',
          appId: 'notes',
          widgetId: 'summary',
          component: 'NotesWidget',
          source: 'manifest',
        },
      ],
      layouts: [{ i: 'widget-1', x: 0, y: 0, w: 2, h: 2 }],
    }, true);

    await act(async () => {
      root?.render(<Dashboard />);
    });

    expect(container.querySelector('[data-testid="grid-layout"]')).not.toBeNull();
    expect(container.textContent).toContain('widget-1');
    expect(container.textContent).toContain('widgets:1');
  });

  it('updates layout in memory and persists only when interaction stops', async () => {
    const updateLayouts = vi.fn();
    const persistLayouts = vi.fn();

    useAppStore.setState({
      ...useAppStore.getState(),
      apps: [
        ...initialAppState.apps,
        {
          id: 'notes',
          label: 'Notes',
          icon: 'box',
          builtin: false,
          manifest: createManifest('notes', [
            {
              id: 'summary',
              name: 'Summary',
              component: 'NotesWidget',
              defaultSize: { w: 2, h: 2 },
            },
          ]),
        },
      ],
    }, true);
    useDashboardStore.setState({
      ...useDashboardStore.getState(),
      widgets: [
        {
          instanceId: 'widget-1',
          appId: 'notes',
          widgetId: 'summary',
          component: 'NotesWidget',
          source: 'manifest',
        },
      ],
      layouts: [{ i: 'widget-1', x: 0, y: 0, w: 2, h: 2 }],
      updateLayouts,
      persistLayouts,
    }, true);

    await act(async () => {
      root?.render(<Dashboard />);
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const layoutButton = buttons.find((button) => button.textContent === 'layout-change');
    const dragButton = buttons.find((button) => button.textContent === 'drag-stop');
    const resizeButton = buttons.find((button) => button.textContent === 'resize-stop');

    expect(layoutButton).toBeTruthy();
    expect(dragButton).toBeTruthy();
    expect(resizeButton).toBeTruthy();

    await act(async () => {
      layoutButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateLayouts).toHaveBeenCalledWith([{ i: 'widget-1', x: 1, y: 2, w: 2, h: 2 }]);
    expect(persistLayouts).not.toHaveBeenCalled();

    await act(async () => {
      dragButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      resizeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(persistLayouts).toHaveBeenCalledTimes(2);
  });
});
