import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SeroAppManifest } from '@/types/ipc';
import { useThemeStore } from '@/stores/theme';
import { useWorkspaceStore } from '@/stores/workspace';

const federationMocks = vi.hoisted(() => ({
  getFederatedComponent: vi.fn(),
  refreshTransientRemote: vi.fn<(appId: string) => void>(),
  hasTransientRemote: vi.fn<(appId: string) => boolean>(),
}));

vi.mock('@/lib/federation-registry', () => ({
  getFederatedComponent: federationMocks.getFederatedComponent,
  refreshTransientRemote: federationMocks.refreshTransientRemote,
  hasTransientRemote: federationMocks.hasTransientRemote,
}));

import { SeroAppMount } from './SeroAppMount';

function createManifest(id: string, name: string): SeroAppManifest {
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
    component: `${name}App`,
    devPort: 4100,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets: [],
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
});
