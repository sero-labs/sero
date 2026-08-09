import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SeroAppManifest } from '@/types/ipc';
import { useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';

const federationMocks = vi.hoisted(() => ({
  getFederatedComponent: vi.fn(),
  prioritizeFederatedStyles: vi.fn<(appId: string) => void>(),
  refreshTransientRemote: vi.fn<(appId: string) => void>(),
  hasTransientRemote: vi.fn<(appId: string) => boolean>(),
}));

vi.mock('@/lib/federation-registry', () => ({
  getFederatedComponent: federationMocks.getFederatedComponent,
  prioritizeFederatedStyles: federationMocks.prioritizeFederatedStyles,
  refreshTransientRemote: federationMocks.refreshTransientRemote,
  hasTransientRemote: federationMocks.hasTransientRemote,
}));

import { SeroAppMount } from './SeroAppMount';

function createManifest(
  id: string,
  name: string,
  overrides: Partial<SeroAppManifest> = {},
): SeroAppManifest {
  return {
    id,
    name,
    description: null,
    version: '1.0.0',
    packageName: `@sero/${id}`,
    icon: 'box',
    stateFile: `.sero/apps/${id}/state.json`,
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: `sero-ext://${id}/mf-manifest.json`,
    runtimeEntry: null,
    component: `${name}App`,
    devPort: 4100,
    remoteEntryOverride: null,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    contributions: { components: [], controls: [] },
    contributionDiagnostics: [],
    ...overrides,
  };
}

describe('SeroAppMount', () => {
  it('shows a loading state while workspace data is still hydrating', () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: 'workspace-1',
      workspaces: [],
      workspacesReady: false,
    });
    useThemeStore.setState({
      effectiveMode: 'dark',
      activePresetId: 'default',
    });

    const html = renderToStaticMarkup(
      <SeroAppMount manifest={createManifest('todo', 'Todo')} />,
    );

    expect(html).toContain('Loading Todo');
    expect(html).not.toContain('No workspace selected');
    expect(federationMocks.getFederatedComponent).not.toHaveBeenCalled();
  });

  it('renders the existing placeholder without touching federation when discovery suppresses UI for backend-only sessions', () => {
    useWorkspaceStore.setState({
      activeWorkspaceId: 'global',
      workspaces: [],
      workspacesReady: true,
    });
    useThemeStore.setState({
      effectiveMode: 'dark',
      activePresetId: 'default',
    });

    const html = renderToStaticMarkup(
      <SeroAppMount
        manifest={createManifest('todo', 'Todo', {
          scope: 'global',
          globalStatePath: '/tmp/todo.json',
          component: null,
          uiEntry: null,
        })}
      />,
    );

    expect(html).toContain('No UI module registered');
    expect(federationMocks.getFederatedComponent).not.toHaveBeenCalled();
  });
});
