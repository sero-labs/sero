// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';

const federationMocks = vi.hoisted(() => ({
  preloadFederatedModule: vi.fn<(appId: string, component: string, devPort: number | undefined) => Promise<void>>(),
  registerDynamicRemote: vi.fn<(appId: string, devPort: number | undefined) => void>(),
  invalidateRemote: vi.fn<(appId: string) => void>(),
}));

vi.mock('@/lib/federation-registry', () => ({
  preloadFederatedModule: federationMocks.preloadFederatedModule,
  registerDynamicRemote: federationMocks.registerDynamicRemote,
  invalidateRemote: federationMocks.invalidateRemote,
}));

import { discoverAndRegisterApps, handlePluginChange, useAppStore } from './app';

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
    isPlugin: false,
    widgets: [],
  };
}

describe('discoverAndRegisterApps', () => {
  const initialState = useAppStore.getState();
  const discover = vi.fn<() => Promise<SeroAppManifest[]>>();

  beforeEach(() => {
    federationMocks.preloadFederatedModule.mockResolvedValue();
    federationMocks.registerDynamicRemote.mockReset();
    federationMocks.invalidateRemote.mockReset();
    discover.mockReset();
    (window as Window & { sero: any }).sero = {
      apps: {
        discover,
        onNewAppDetected: vi.fn(() => () => {}),
      },
      plugins: {
        onChanged: vi.fn(() => () => {}),
      },
      layout: {
        save: vi.fn().mockResolvedValue(undefined),
      },
    };

    useAppStore.setState({
      ...initialState,
      activeApp: 'research',
      favouriteApps: ['todo', 'notes'],
      appsReady: false,
      pendingApp: null,
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

  it('falls back to dashboard and drops missing favourites when discovered apps change', async () => {
    discover.mockResolvedValue([
      createManifest('notes', 'NotesApp', 4102),
    ]);

    await discoverAndRegisterApps();

    expect(useAppStore.getState().activeApp).toBe('dashboard');
    expect(useAppStore.getState().favouriteApps).toEqual(['notes']);
  });

  it('ignores attempts to activate an unknown app id', () => {
    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'dashboard',
      pendingApp: null,
    });

    useAppStore.getState().setActiveApp('missing-app');

    expect(useAppStore.getState().activeApp).toBe('dashboard');
    expect(useAppStore.getState().pendingApp).toBeNull();
  });

  it('hot-refreshes runtime remotes after plugin install and uninstall events', async () => {
    const installEvent: PluginChangeEvent = {
      type: 'installed',
      manifest: createManifest('todo', 'TodoApp', 4101),
    };

    discover
      .mockResolvedValueOnce([installEvent.manifest])
      .mockResolvedValueOnce([]);

    await handlePluginChange(installEvent);

    expect(federationMocks.invalidateRemote).toHaveBeenCalledWith('todo');
    expect(federationMocks.registerDynamicRemote).toHaveBeenCalledWith('todo', 4101);
    expect(
      federationMocks.invalidateRemote.mock.invocationCallOrder[0],
    ).toBeLessThan(federationMocks.registerDynamicRemote.mock.invocationCallOrder[0]);
    expect(useAppStore.getState().apps.some((app) => app.id === 'todo')).toBe(true);

    await handlePluginChange({ type: 'uninstalled', pluginId: 'todo' });

    expect(federationMocks.invalidateRemote).toHaveBeenCalledWith('todo');
    expect(useAppStore.getState().apps.some((app) => app.id === 'todo')).toBe(false);
  });
});
