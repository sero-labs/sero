import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { PluginStyleScope, usePluginPortalContainer } from './plugin-style-scope';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

describe('PluginStyleScope', () => {
  it('owns and removes an independent body portal container', () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    const root = createRoot(mount);

    function Probe() {
      const container = usePluginPortalContainer();
      return <span data-container={container?.dataset.seroPluginPortals} />;
    }

    act(() => root.render(
      <PluginStyleScope pluginId="admin" surfaceId="surface-1">
        <Probe />
      </PluginStyleScope>,
    ));

    const portal = document.body.querySelector('[data-sero-plugin-portals="surface-1"]');
    expect(portal?.getAttribute('data-sero-plugin')).toBe('admin');
    expect(mount.querySelector('span')?.getAttribute('data-container')).toBe('surface-1');

    act(() => root.unmount());
    expect(portal?.isConnected).toBe(false);
  });
});
