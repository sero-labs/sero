// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';

const federationMocks = vi.hoisted(() => ({
  preloadFederatedModule: vi.fn<(appId: string, component: string, devPort: number | undefined) => Promise<void>>(),
}));

vi.mock('@/lib/federation-registry', () => ({
  preloadFederatedModule: federationMocks.preloadFederatedModule,
}));

import { discoverAndRegisterApps, useAppStore } from './app';

function createManifest(
  id: string,
  component: string | null,
  devPort?: number,
): SeroAppManifest {
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
    uiEntry: component ? `sero-ext://${id}/mf-manifest.json` : null,
    component,
    devPort,
    packagePath: `/tmp/${id}`,
  };
}

describe('discoverAndRegisterApps', () => {
  const initialState = useAppStore.getState();
  const discover = vi.fn<() => Promise<SeroAppManifest[]>>();

  beforeEach(() => {
    federationMocks.preloadFederatedModule.mockResolvedValue();
    discover.mockReset();
    (window as Window & { sero: any }).sero = {
      apps: { discover },
    };

    useAppStore.setState({
      ...initialState,
      activeApp: 'research',
      favouriteApps: ['todo', 'notes'],
      appsReady: false,
    }, true);
  });

  afterEach(() => {
    federationMocks.preloadFederatedModule.mockReset();
    useAppStore.setState(initialState, true);
  });

  it('preloads only the hydrated active app and favourites', async () => {
    discover.mockResolvedValue([
      createManifest('todo', 'TodoApp', 4101),
      createManifest('notes', 'NotesApp', 4102),
      createManifest('research', 'ResearchApp', 4103),
      createManifest('admin', 'AdminApp', 4104),
      createManifest('no-ui', null, 4105),
    ]);

    await discoverAndRegisterApps();

    expect(
      federationMocks.preloadFederatedModule.mock.calls.map(([appId]) => appId).sort(),
    ).toEqual(['notes', 'research', 'todo']);
    expect(useAppStore.getState().appsReady).toBe(true);
  });
});
