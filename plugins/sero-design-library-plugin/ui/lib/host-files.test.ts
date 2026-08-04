// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { canShowItemInFolder, showItemInFolder } from './host-files';

afterEach(() => {
  Reflect.deleteProperty(window, 'sero');
});

describe('Design file host bridge', () => {
  it('reveals a folder through the existing generic shell bridge', async () => {
    const reveal = vi.fn(async () => undefined);
    Reflect.set(window, 'sero', { shell: { showItemInFolder: reveal } });

    expect(canShowItemInFolder()).toBe(true);
    await showItemInFolder('/profile/designs/dsn-1/variants/var-1/rev-1');

    expect(reveal).toHaveBeenCalledWith(
      '/profile/designs/dsn-1/variants/var-1/rev-1',
    );
  });

  it('reports no action on a host without a file manager', () => {
    expect(canShowItemInFolder()).toBe(false);
  });
});
