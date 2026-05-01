// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function CrashyPanel({ shouldThrow, error }: { shouldThrow: boolean; error?: Error }) {
  if (shouldThrow) {
    throw error ?? new Error('boom');
  }
  return <div>healthy panel</div>;
}

const RELOAD_KEY = '__sero_chunk_reload_at';

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let reloadSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sessionStorage.removeItem(RELOAD_KEY);
    reloadSpy = vi.fn();
    originalLocation = window.location;
    // jsdom marks Location.reload as non-configurable, so replace the whole
    // location descriptor for the duration of these tests.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
      writable: true,
    });
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
      writable: true,
    });
    sessionStorage.removeItem(RELOAD_KEY);
    consoleErrorSpy.mockRestore();
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
  });

  it('recovers when the keyed region identity changes after a crash', async () => {
    await act(async () => {
      root?.render(
        <ErrorBoundary key="broken-app" region="Plugin">
          <CrashyPanel shouldThrow />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('Plugin crashed');
    expect(container.textContent).toContain('Copy error');

    await act(async () => {
      root?.render(
        <ErrorBoundary key="healthy-app" region="Plugin">
          <CrashyPanel shouldThrow={false} />
        </ErrorBoundary>,
      );
    });

    expect(container.textContent).toContain('healthy panel');
    expect(container.textContent).not.toContain('Plugin crashed');
  });

  it('auto-reloads once when a stale dynamic-import error is caught', async () => {
    const chunkError = new Error(
      "Failed to fetch dynamically imported module: http://localhost:5173/node_modules/.vite/deps/highlighted-body-OFNGDK62-Q03MMVC6.js?v=c2fb6155",
    );

    await act(async () => {
      root?.render(
        <ErrorBoundary region="Chat" compact>
          <CrashyPanel shouldThrow error={chunkError} />
        </ErrorBoundary>,
      );
    });

    // Reload is queued via setTimeout(0) — flush timers to fire it.
    await act(async () => {
      vi.runAllTimers();
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_KEY)).not.toBeNull();
  });

  it('shows a manual Reload action when chunk errors recur within the cooldown', async () => {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    const chunkError = new Error(
      'Failed to fetch dynamically imported module: /assets/chunk-abc.js',
    );

    await act(async () => {
      root?.render(
        <ErrorBoundary region="Chat" compact>
          <CrashyPanel shouldThrow error={chunkError} />
        </ErrorBoundary>,
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Stale module');
    expect(container.textContent).toContain('Reload');
    expect(container.textContent).not.toContain('Retry');
  });

  it('keeps the regular Retry UI for non-chunk errors', async () => {
    await act(async () => {
      root?.render(
        <ErrorBoundary region="Plugin" compact>
          <CrashyPanel shouldThrow />
        </ErrorBoundary>,
      );
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(reloadSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Plugin crashed');
    expect(container.textContent).toContain('Retry');
  });
});
