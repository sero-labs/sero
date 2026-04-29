// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from './ErrorBoundary';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function CrashyPanel({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom');
  }
  return <div>healthy panel</div>;
}

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
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
});
