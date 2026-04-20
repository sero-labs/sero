// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginChangeEvent, SeroAppManifest } from '@/types/ipc';

const federationMocks = vi.hoisted(() => ({
  preloadFederatedModule: vi.fn<(
    appId: string,
    component: string,
    devPort: number | undefined,
    remoteEntryOverride: string | null,
  ) => Promise<void>>(),
  registerDynamicRemote: vi.fn<(
    appId: string,
    devPort: number | undefined,
    remoteEntryOverride: string | null,
  ) => void>(),
  invalidateRemote: vi.fn<(appId: string) => void>(),
  refreshTransientRemote: vi.fn<(appId: string) => void>(),
  hasTransientRemote: vi.fn<(appId: string) => boolean>(),
}));

vi.mock('@/lib/federation-registry', () => ({
  preloadFederatedModule: federationMocks.preloadFederatedModule,
  registerDynamicRemote: federationMocks.registerDynamicRemote,
  invalidateRemote: federationMocks.invalidateRemote,
  refreshTransientRemote: federationMocks.refreshTransientRemote,
  hasTransientRemote: federationMocks.hasTransientRemote,
}));

import {
  discoverAndRegisterApps,
  handlePluginChange,
  listenForNewApps,
  useAppStore,
} from './app';

function createManifest(
  id: string,
  component: string | null,
  devPort?: number,
  overrides?: Partial<SeroAppManifest>,
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
    remoteEntryOverride: null,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets: [],
    ...overrides,
    runtimeEntry: overrides?.runtimeEntry ?? null,
  };
}

describe('discoverAndRegisterApps', () => {
  const initialState = useAppStore.getState();
  const discover = vi.fn<() => Promise<SeroAppManifest[]>>();

  beforeEach(() => {
    federationMocks.preloadFederatedModule.mockResolvedValue();
    federationMocks.registerDynamicRemote.mockReset();
    federationMocks.invalidateRemote.mockReset();
    federationMocks.refreshTransientRemote.mockReset();
    federationMocks.hasTransientRemote.mockReset();
    federationMocks.hasTransientRemote.mockReturnValue(false);
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

  it('falls back to dashboard and drops unsupported favourites when discovered apps change', async () => {
    discover.mockResolvedValue([
      createManifest('notes', 'NotesApp', 4102),
      createManifest('future-plugin', 'FuturePluginApp', 4103, {
        isPlugin: true,
        hostCompatibility: {
          supported: false,
          hostVersion: '0.1.0',
          issues: [{
            kind: 'minSeroVersion',
            message: 'Requires Sero 9.9.9 or newer.',
            expected: '9.9.9',
            actual: '0.1.0',
          }],
        },
      }),
    ]);

    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'future-plugin',
      favouriteApps: ['notes', 'future-plugin'],
    });

    await discoverAndRegisterApps();

    expect(useAppStore.getState().activeApp).toBe('dashboard');
    expect(useAppStore.getState().favouriteApps).toEqual(['notes']);
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

  it('refreshes transient remotes when re-selecting the active app', () => {
    federationMocks.hasTransientRemote.mockReturnValue(true);

    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'todo',
      pendingApp: null,
      apps: [
        ...useAppStore.getState().apps,
        {
          id: 'todo',
          label: 'Todo',
          icon: 'check-square',
          builtin: false,
          manifest: createManifest('todo', 'TodoApp', 4101),
        },
      ],
    });

    useAppStore.getState().setActiveApp('todo');

    expect(federationMocks.refreshTransientRemote).toHaveBeenCalledWith('todo');
    expect(
      federationMocks.refreshTransientRemote.mock.invocationCallOrder[0],
    ).toBeLessThan(federationMocks.preloadFederatedModule.mock.invocationCallOrder[0]);
  });

  it('refreshes transient remotes before re-activating an app', () => {
    federationMocks.hasTransientRemote.mockReturnValue(true);

    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'dashboard',
      pendingApp: null,
      apps: [
        ...useAppStore.getState().apps,
        {
          id: 'todo',
          label: 'Todo',
          icon: 'check-square',
          builtin: false,
          manifest: createManifest('todo', 'TodoApp', 4101),
        },
      ],
    });

    useAppStore.getState().setActiveApp('todo');

    expect(federationMocks.refreshTransientRemote).toHaveBeenCalledWith('todo');
    expect(
      federationMocks.refreshTransientRemote.mock.invocationCallOrder[0],
    ).toBeLessThan(federationMocks.preloadFederatedModule.mock.invocationCallOrder[0]);
  });

  it('rediscovers apps when plugin-change events report dev-session updates', async () => {
    let pluginChangedHandler: ((event: PluginChangeEvent) => void) | null = null;
    const unsubscribePlugins = vi.fn();
    const unsubscribeApps = vi.fn();

    const onChangedMock = window.sero.plugins.onChanged as unknown as ReturnType<typeof vi.fn>;
    const onNewAppDetectedMock = window.sero.apps.onNewAppDetected as unknown as ReturnType<typeof vi.fn>;

    onChangedMock.mockImplementation((callback: (event: PluginChangeEvent) => void) => {
      pluginChangedHandler = callback;
      return unsubscribePlugins;
    });
    onNewAppDetectedMock.mockImplementation(() => unsubscribeApps);

    discover.mockResolvedValue([
      createManifest('todo', 'TodoApp', 4101, {
        remoteEntryOverride: 'http://127.0.0.1:4101/mf-manifest.json',
      }),
    ]);

    const unsubscribe = listenForNewApps();

    await vi.waitFor(() => {
      expect(pluginChangedHandler).not.toBeNull();
    });

    if (!pluginChangedHandler) {
      throw new Error('Expected plugin change handler to be registered');
    }

    const emitPluginChanged = pluginChangedHandler as (event: PluginChangeEvent) => void;
    emitPluginChanged({
      type: 'changed',
      pluginId: 'todo',
      reason: 'dev-session-refreshed',
    });

    await vi.waitFor(() => {
      expect(discover).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().apps.some((app) => app.id === 'todo')).toBe(true);
    });

    unsubscribe();
    expect(unsubscribeApps).toHaveBeenCalledTimes(1);
    expect(unsubscribePlugins).toHaveBeenCalledTimes(1);
  });

  it('hot-refreshes runtime remotes after plugin install, dev-session refresh, and dev-session stop events', async () => {
    const installEvent: PluginChangeEvent = {
      type: 'installed',
      manifest: createManifest('todo', 'TodoApp', 4101),
    };
    const devSessionEvent: PluginChangeEvent = {
      type: 'changed',
      pluginId: 'todo',
      manifest: createManifest('todo', 'TodoApp', 4101, {
        remoteEntryOverride: 'http://127.0.0.1:4101/mf-manifest.json',
      }),
      reason: 'dev-session-refreshed',
    };

    discover
      .mockResolvedValueOnce([installEvent.manifest])
      .mockResolvedValueOnce([
        createManifest('todo', 'TodoApp', 4101, {
          remoteEntryOverride: 'http://127.0.0.1:4101/mf-manifest.json?t=2026-04-20T10%3A00%3A00.000Z',
        }),
      ])
      .mockResolvedValueOnce([]);

    await handlePluginChange(installEvent);

    expect(federationMocks.invalidateRemote).toHaveBeenCalledWith('todo');
    expect(federationMocks.registerDynamicRemote).toHaveBeenCalledWith('todo', 4101, null);
    expect(
      federationMocks.invalidateRemote.mock.invocationCallOrder[0],
    ).toBeLessThan(federationMocks.registerDynamicRemote.mock.invocationCallOrder[0]);
    expect(useAppStore.getState().apps.some((app) => app.id === 'todo')).toBe(true);

    useAppStore.setState({
      ...useAppStore.getState(),
      activeApp: 'todo',
      apps: [
        ...useAppStore.getState().apps.filter((app) => app.id !== 'todo'),
        {
          id: 'todo',
          label: 'Todo',
          icon: 'check-square',
          builtin: false,
          manifest: installEvent.manifest,
        },
      ],
    });

    await handlePluginChange(devSessionEvent);

    expect(federationMocks.invalidateRemote).toHaveBeenCalledWith('todo');
    expect(federationMocks.registerDynamicRemote).toHaveBeenCalledWith(
      'todo',
      4101,
      'http://127.0.0.1:4101/mf-manifest.json',
    );
    expect(federationMocks.refreshTransientRemote).toHaveBeenCalledWith('todo');
    expect(federationMocks.preloadFederatedModule).toHaveBeenCalledWith(
      'todo',
      'TodoApp',
      4101,
      'http://127.0.0.1:4101/mf-manifest.json?t=2026-04-20T10%3A00%3A00.000Z',
    );

    await handlePluginChange({
      type: 'changed',
      pluginId: 'todo',
      reason: 'dev-session-stopped',
    });

    expect(federationMocks.invalidateRemote).toHaveBeenCalledWith('todo');
    expect(useAppStore.getState().apps.some((app) => app.id === 'todo')).toBe(false);
  });
});
