// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeWidget } from '@sero-ai/app-runtime';
import { getAvailableWidgets, useDashboardStore } from './dashboard';
import type { SeroAppManifest } from '@/types/ipc';

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
    runtimeEntry: null,
    component: `${id}App`,
    devPort: 4100,
    packagePath: `/tmp/${id}`,
    isPlugin: false,
    widgets,
  };
}

const initialState = useDashboardStore.getState();

afterEach(() => {
  useDashboardStore.setState(initialState, true);
});

describe('dashboard store', () => {
  it('merges runtime widgets without duplicating static manifest widgets', () => {
    const manifests = [
      createManifest('notes', [
        {
          id: 'pinboard',
          name: 'Pinboard',
          component: 'NotesWidget',
          defaultSize: { w: 2, h: 2 },
        },
      ]),
    ];

    const runtimeWidgets: RuntimeWidget[] = [
      {
        appId: 'notes',
        widgetId: 'pinboard',
        name: 'Pinboard',
        component: () => null,
        defaultSize: { w: 2, h: 2 },
      },
      {
        appId: 'notes',
        widgetId: 'focus',
        name: 'Focus',
        component: () => null,
        defaultSize: { w: 1, h: 1 },
      },
    ];

    const widgets = getAvailableWidgets(manifests, runtimeWidgets);

    expect(widgets.map((widget) => `${widget.appId}:${widget.manifest.id}`)).toEqual([
      'notes:pinboard',
      'notes:focus',
    ]);
    expect(widgets.find((widget) => widget.manifest.id === 'pinboard')?.source).toBe('manifest');
    expect(widgets.find((widget) => widget.manifest.id === 'focus')?.source).toBe('runtime');
  });

  it('defaults persisted widgets without a source to manifest widgets during hydrate', () => {
    useDashboardStore.getState().hydrate({
      widgets: [
        {
          instanceId: 'widget-1',
          appId: 'notes',
          widgetId: 'pinboard',
          component: 'NotesWidget',
        },
      ],
      layouts: [],
    });

    expect(useDashboardStore.getState().widgets[0]?.source).toBe('manifest');
  });
});
