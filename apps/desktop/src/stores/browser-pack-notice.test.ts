// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const persistLayout = vi.hoisted(() => vi.fn());

vi.mock('@/lib/persist-layout', () => ({ persistLayout }));

import { useBrowserPackNoticeStore } from './browser-pack-notice';

const updateStatus = {
  state: 'installable' as const,
  manifestVersion: 'browser-pack-current',
  previousManifestVersion: 'browser-pack-previous',
  artifactKey: 'browser-darwin-arm64',
};

describe('browser pack update notice', () => {
  afterEach(() => {
    useBrowserPackNoticeStore.setState({
      notifiedVersion: null,
      status: null,
      visible: false,
    });
    persistLayout.mockReset();
    Reflect.deleteProperty(window, 'sero');
  });

  it('shows and records each browser pack update once', async () => {
    Reflect.set(window, 'sero', {
      workspace: { getBrowserPackStatus: vi.fn(async () => updateStatus) },
    });

    await useBrowserPackNoticeStore.getState().check();

    expect(useBrowserPackNoticeStore.getState()).toMatchObject({
      notifiedVersion: updateStatus.manifestVersion,
      visible: true,
    });
    expect(persistLayout).toHaveBeenCalledWith({
      browserPackNoticeVersion: updateStatus.manifestVersion,
    });

    useBrowserPackNoticeStore.getState().dismiss();
    await useBrowserPackNoticeStore.getState().check();
    expect(useBrowserPackNoticeStore.getState().visible).toBe(false);
  });

  it('does not announce a first browser pack install as an update', async () => {
    Reflect.set(window, 'sero', {
      workspace: {
        getBrowserPackStatus: vi.fn(async () => ({
          ...updateStatus,
          previousManifestVersion: undefined,
        })),
      },
    });

    await useBrowserPackNoticeStore.getState().check();

    expect(useBrowserPackNoticeStore.getState().visible).toBe(false);
    expect(persistLayout).not.toHaveBeenCalled();
  });
});
