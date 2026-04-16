import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(),
  },
  net: {
    fetch: vi.fn(),
  },
}));

import {
  hasRegisteredExtAssets,
  registerAllExtAssets,
  registerExtAssets,
  unregisterExtAssets,
} from '@electron/platform/protocols/ext-protocol';
import type { SeroAppManifest } from '@/types/ipc';

function makeManifest(overrides: Partial<SeroAppManifest> & Pick<SeroAppManifest, 'id' | 'name' | 'packagePath'>): SeroAppManifest {
  const {
    id,
    name,
    packagePath,
    ...rest
  } = overrides;

  return {
    id,
    name,
    description: null,
    version: null,
    packageName: id,
    icon: 'box',
    stateFile: '.sero/state.json',
    scope: 'workspace',
    globalStatePath: null,
    uiEntry: null,
    component: null,
    devPort: undefined,
    packagePath,
    isPlugin: true,
    plugin: null,
    widgets: [],
    ...rest,
  };
}

describe('extension asset registry', () => {
  beforeEach(() => {
    unregisterExtAssets('with-ui');
    unregisterExtAssets('without-ui');
    unregisterExtAssets('single-app');
  });

  it('registers and unregisters individual app manifests', () => {
    registerExtAssets(makeManifest({
      id: 'single-app',
      name: 'Single App',
      packagePath: '/tmp/single-app',
      uiEntry: 'dist/ui/remoteEntry.js',
      component: 'SingleApp',
    }));

    expect(hasRegisteredExtAssets('single-app')).toBe(true);

    unregisterExtAssets('single-app');
    expect(hasRegisteredExtAssets('single-app')).toBe(false);
  });

  it('only bulk-registers apps that expose a UI entry', () => {
    registerAllExtAssets([
      makeManifest({
        id: 'with-ui',
        name: 'With UI',
        packagePath: '/tmp/with-ui',
        uiEntry: 'dist/ui/remoteEntry.js',
        component: 'WithUI',
      }),
      makeManifest({
        id: 'without-ui',
        name: 'Without UI',
        packagePath: '/tmp/without-ui',
      }),
    ]);

    expect(hasRegisteredExtAssets('with-ui')).toBe(true);
    expect(hasRegisteredExtAssets('without-ui')).toBe(false);
  });
});
