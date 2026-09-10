import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  isModelNetworkDisabled: vi.fn(() => false),
  queueModelAvailabilityRefresh: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { on: mocks.appOn },
}));

vi.mock('@electron/ipc/agent/core/model-availability-refresh', () => ({
  isModelNetworkDisabled: mocks.isModelNetworkDisabled,
  queueModelAvailabilityRefresh: mocks.queueModelAvailabilityRefresh,
}));

import {
  startModelCatalogRefresh,
  stopModelCatalogRefresh,
} from '@electron/features/models/model-catalog-refresh';

/** Mirrors the module's cadence; the design pins six hours. */
const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

function beforeQuitHandler(): (() => void) | undefined {
  const call = mocks.appOn.mock.calls.find(([event]) => event === 'before-quit');
  return call?.[1] as (() => void) | undefined;
}

describe('model catalog refresh schedule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.appOn.mockReset();
    mocks.isModelNetworkDisabled.mockReset().mockReturnValue(false);
    mocks.queueModelAvailabilityRefresh.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    stopModelCatalogRefresh();
    vi.useRealTimers();
  });

  it('refreshes once at startup and then once per interval tick', async () => {
    startModelCatalogRefresh();

    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS - 1);
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(3);
  });

  it('starts without waiting for the refresh to settle', async () => {
    let settle: (() => void) | undefined;
    mocks.queueModelAvailabilityRefresh.mockImplementation(
      () => new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );

    // A synchronous return is the contract: window creation and the first
    // model list must not wait for a network round trip.
    const returned = startModelCatalogRefresh();

    expect(returned).toBeUndefined();
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(1);

    settle?.();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('registers the quit handler once and stops refreshing on quit', async () => {
    startModelCatalogRefresh();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.appOn).toHaveBeenCalledTimes(1);
    expect(mocks.appOn.mock.calls[0][0]).toBe('before-quit');

    beforeQuitHandler()?.();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 3);

    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a second start and a repeated stop', async () => {
    startModelCatalogRefresh();
    startModelCatalogRefresh();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    expect(mocks.appOn).toHaveBeenCalledTimes(1);
    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(2);

    stopModelCatalogRefresh();
    stopModelCatalogRefresh();
    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS);

    expect(mocks.queueModelAvailabilityRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('model catalog refresh while offline', () => {
  const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.appOn.mockReset();
    mocks.isModelNetworkDisabled.mockReset().mockReturnValue(true);
    mocks.queueModelAvailabilityRefresh.mockReset().mockResolvedValue(undefined);
    consoleInfo.mockClear();
  });

  afterEach(() => {
    stopModelCatalogRefresh();
    vi.useRealTimers();
  });

  it('skips the startup refresh and every tick without touching the refresh path', async () => {
    startModelCatalogRefresh();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.queueModelAvailabilityRefresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(REFRESH_INTERVAL_MS * 2);

    expect(mocks.queueModelAvailabilityRefresh).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledTimes(3);
    expect(consoleInfo).toHaveBeenCalledWith(
      '[model-catalog] Offline; skipping model catalog refresh',
    );
  });
});
