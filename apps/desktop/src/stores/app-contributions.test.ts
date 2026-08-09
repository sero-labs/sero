import { describe, expect, it } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import { getContributions, type AppEntry } from './app';

function createManifest(
  id: string,
  components: SeroAppManifest['contributions']['components'],
  overrides: Partial<SeroAppManifest> = {},
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
    uiEntry: `sero-ext://${id}/mf-manifest.json`,
    runtimeEntry: null,
    component: `${id}App`,
    devPort: undefined,
    remoteEntryOverride: null,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    contributions: { components, controls: [] },
    contributionDiagnostics: [],
    ...overrides,
  };
}

function createApp(manifest: SeroAppManifest): AppEntry {
  return {
    id: manifest.id,
    label: manifest.name,
    icon: manifest.icon,
    builtin: false,
    manifest,
  };
}

describe('getContributions', () => {
  it('returns multiple contributions in app and manifest order with stable keys', () => {
    const apps = [
      createApp(createManifest('first', [
        { id: 'one', extensionPoint: 'ui.global-search.panel', component: 'One' },
        { id: 'two', extensionPoint: 'ui.global-search.panel', component: 'Two' },
      ])),
      createApp(createManifest('second', [
        { id: 'three', extensionPoint: 'ui.global-search.panel', component: 'Three' },
      ])),
    ];

    expect(getContributions(apps, 'ui.global-search.panel').map((entry) => entry.key)).toEqual([
      'first:one',
      'first:two',
      'second:three',
    ]);
  });

  it('excludes host-incompatible apps', () => {
    const app = createApp(createManifest('future', [
      { id: 'search', extensionPoint: 'ui.global-search.panel', component: 'Search' },
    ], {
      hostCompatibility: {
        supported: false,
        hostVersion: '0.1.0',
        issues: [],
      },
    }));

    expect(getContributions([app], 'ui.global-search.panel')).toEqual([]);
  });

  it('derives changed contributions from a replaced hot-reload manifest', () => {
    const initial = createApp(createManifest('notes', [
      { id: 'search', extensionPoint: 'ui.global-search.panel', component: 'SearchV1' },
    ]));
    const refreshed = createApp(createManifest('notes', [
      { id: 'search', extensionPoint: 'ui.global-search.panel', component: 'SearchV2' },
      { id: 'extra', extensionPoint: 'ui.global-search.panel', component: 'ExtraSearch' },
    ]));

    expect(getContributions([initial], 'ui.global-search.panel').map(
      (entry) => entry.contribution.component,
    )).toEqual(['SearchV1']);
    expect(getContributions([refreshed], 'ui.global-search.panel').map(
      (entry) => entry.contribution.component,
    )).toEqual(['SearchV2', 'ExtraSearch']);
  });
});
