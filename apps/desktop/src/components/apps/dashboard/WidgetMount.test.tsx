// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { SeroAppManifest } from '@/types/ipc';
import type { AvailableWidget, DashboardWidgetInstance } from '@/types/dashboard';
import { useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';

const federationMocks = vi.hoisted(() => ({
  getFederatedComponent: vi.fn(),
}));

vi.mock('@/lib/federation-registry', () => ({
  getFederatedComponent: federationMocks.getFederatedComponent,
}));

import { WidgetMount } from './WidgetMount';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createManifest(id: string, scope: SeroAppManifest['scope'] = 'workspace'): SeroAppManifest {
  return {
    id,
    name: id,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope,
    globalStatePath: scope === 'global' ? `/tmp/${id}.json` : null,
    uiEntry: `sero-ext://${id}/mf-manifest.json`,
    runtimeEntry: null,
    component: `${id}App`,
    devPort: 4100,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets: [],
  };
}

function createWidget(overrides: Partial<DashboardWidgetInstance> = {}): DashboardWidgetInstance {
  return {
    instanceId: 'widget-1',
    appId: 'notes',
    widgetId: 'summary',
    component: 'NotesWidget',
    source: 'manifest',
    ...overrides,
  };
}

function createWidgetMeta(overrides: Partial<AvailableWidget> = {}): AvailableWidget {
  return {
    appId: 'notes',
    appName: 'Notes',
    appIcon: 'box',
    manifest: {
      id: 'summary',
      name: 'Summary',
      component: 'NotesWidget',
      defaultSize: { w: 2, h: 2 },
    },
    devPort: 4100,
    source: 'manifest',
    ...overrides,
  };
}

describe('WidgetMount', () => {
  const initialWorkspaceState = useWorkspaceStore.getState();
  const initialThemeState = useThemeStore.getState();
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    federationMocks.getFederatedComponent.mockReset();
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useThemeStore.setState(initialThemeState, true);
    useThemeStore.setState({
      effectiveMode: 'dark',
      activePresetId: 'default',
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useThemeStore.setState(initialThemeState, true);
  });

  it('shows a loading state while workspace data is still hydrating', async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      workspacesReady: false,
    });

    await act(async () => {
      root?.render(
        <WidgetMount
          widget={createWidget()}
          manifest={createManifest('notes')}
          widgetMeta={createWidgetMeta()}
        />,
      );
    });

    expect(container.textContent).toContain('Loading widget');
    expect(container.textContent).not.toContain('No workspace selected');
    expect(federationMocks.getFederatedComponent).not.toHaveBeenCalled();
  });

  it('shows a missing-workspace placeholder after hydration completes', async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      workspacesReady: true,
    });

    await act(async () => {
      root?.render(
        <WidgetMount
          widget={createWidget()}
          manifest={createManifest('notes')}
          widgetMeta={createWidgetMeta()}
        />,
      );
    });

    expect(container.textContent).toContain('No workspace selected');
  });

  it('shows a fallback when a runtime widget has no runtime component', async () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: 'global',
      workspaces: [],
      workspacesReady: true,
    });

    await act(async () => {
      root?.render(
        <WidgetMount
          widget={createWidget({ source: 'runtime' })}
          manifest={createManifest('notes', 'global')}
          widgetMeta={createWidgetMeta({ source: 'runtime', runtimeComponent: undefined })}
        />,
      );
    });

    expect(container.textContent).toContain('Widget unavailable');
  });

  it('shows a fallback when no federated widget module is registered', async () => {
    federationMocks.getFederatedComponent.mockReturnValue(null);
    useWorkspaceStore.setState({
      activeWorkspaceId: 'global',
      workspaces: [],
      workspacesReady: true,
    });

    await act(async () => {
      root?.render(
        <WidgetMount
          widget={createWidget()}
          manifest={createManifest('notes', 'global')}
          widgetMeta={createWidgetMeta()}
        />,
      );
    });

    expect(container.textContent).toContain('Widget unavailable');
  });
});
