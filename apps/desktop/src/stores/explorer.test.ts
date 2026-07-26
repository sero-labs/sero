import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/persist-layout', () => ({ persistLayout: vi.fn() }));

import { useExplorerStore } from './explorer';

describe('explorer store hydration', () => {
  it('keeps a persisted panel id contributed by a plugin', () => {
    useExplorerStore.getState().hydrate({ ws: { activePanel: 'git-plugin' } });
    expect(useExplorerStore.getState().get('ws').activePanel).toBe('git-plugin');
  });

  it('keeps an unrecognised panel id rather than resetting to the file tree', () => {
    // The contributing plugin may simply not be loaded yet; the Explorer shows
    // a placeholder and restores the view when the plugin returns.
    useExplorerStore.getState().hydrate({ ws: { activePanel: 'not-installed' } });
    expect(useExplorerStore.getState().get('ws').activePanel).toBe('not-installed');
  });

  it('falls back to the file tree when nothing usable is persisted', () => {
    useExplorerStore.getState().hydrate({ ws: { activePanel: '' } });
    expect(useExplorerStore.getState().get('ws').activePanel).toBe('explorer');
  });
});
