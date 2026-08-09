// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDashboardStore } from '@/stores/dashboard';
import { loadLayout } from './layout-hydration';

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('layout hydration', () => {
  const initialDashboardState = useDashboardStore.getState();

  afterEach(() => {
    useDashboardStore.setState(initialDashboardState, true);
    Reflect.deleteProperty(window, 'sero');
  });

  it('does not overwrite a background change that arrives during hydration', async () => {
    const backgroundLoad = deferred<string | null>();
    const listener: { current: ((dataUrl: string | null) => void) | null } = { current: null };

    Reflect.set(window, 'sero', {
      layout: { load: vi.fn(async () => null) },
      dashboard: {
        getBackground: vi.fn(() => backgroundLoad.promise),
        onBackgroundChanged: vi.fn((callback: (dataUrl: string | null) => void) => {
          listener.current = callback;
          return () => undefined;
        }),
      },
    });

    const hydration = loadLayout();
    await vi.waitFor(() => expect(listener.current).not.toBeNull());
    if (!listener.current) throw new Error('Background listener was not registered');

    listener.current('sero-media://dashboard/background?v=new');
    backgroundLoad.resolve(null);
    await hydration;

    expect(useDashboardStore.getState().backgroundImage).toBe(
      'sero-media://dashboard/background?v=new',
    );
  });
});
