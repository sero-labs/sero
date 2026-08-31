import { describe, expect, it } from 'vitest';
import type { SeroAppManifest } from '@/types/ipc';
import { getContributions, type AppEntry } from './app';
import { getResolvedComponentSlots } from '@/components/apps/contribution-slots';

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
  it('builds sorted provider-neutral descriptors for supported Admin contributions', () => {
    const apps = [
      createApp(createManifest('zeta', [{
        id: 'settings',
        extensionPoint: 'ui.admin.model-settings',
        component: 'Settings',
        name: 'Zeta',
        description: 'Zeta defaults',
        icon: 'z',
      }])),
      createApp(createManifest('alpha', [{
        id: 'settings',
        extensionPoint: 'ui.admin.model-settings',
        component: 'Settings',
        name: 'Alpha',
      }])),
      createApp(createManifest('future', [{
        id: 'settings',
        extensionPoint: 'ui.admin.model-settings',
        component: 'Settings',
        name: 'Future',
      }], { hostCompatibility: { supported: false, hostVersion: '0.1.0', issues: [] } })),
    ];

    const descriptors = getResolvedComponentSlots(apps)
      .filter((slot) => slot.descriptor.extensionPoint === 'ui.admin.model-settings')
      .map((slot) => slot.descriptor);

    expect(descriptors.map((entry) => entry.key)).toEqual([
      'alpha:ui.admin.model-settings:settings',
      'zeta:ui.admin.model-settings:settings',
    ]);
    expect(descriptors[1]).toMatchObject({
      description: 'Zeta defaults',
      icon: 'z',
      contributorAppId: 'zeta',
    });
  });

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
      'first:ui.global-search.panel:one',
      'first:ui.global-search.panel:two',
      'second:ui.global-search.panel:three',
    ]);
  });

  it('isolates a shared id used in two extension points', () => {
    const app = createApp(createManifest('notes', [
      { id: 'global-search', extensionPoint: 'ui.global-search.panel', component: 'SearchPanel' },
      {
        id: 'global-search',
        extensionPoint: 'ui.dashboard.widget',
        component: 'SearchWidget',
        name: 'Search stats',
        defaultSize: { w: 2, h: 2 },
      },
    ]));

    const panels = getContributions([app], 'ui.global-search.panel');
    const widgets = getContributions([app], 'ui.dashboard.widget');

    expect(panels.map((entry) => entry.contribution.component)).toEqual(['SearchPanel']);
    expect(widgets.map((entry) => entry.contribution.component)).toEqual(['SearchWidget']);
    expect(panels[0].key).toBe('notes:ui.global-search.panel:global-search');
    expect(widgets[0].key).toBe('notes:ui.dashboard.widget:global-search');
    expect(panels[0].key).not.toBe(widgets[0].key);
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
