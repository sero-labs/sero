// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransientFlag, useTransientValue } from './useTransientUiState';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('useTransientUiState', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestValue: string | null = null;
  let latestFlag = false;
  let showValue: ((value: string) => void) | null = null;
  let showFlag: (() => void) | null = null;
  let clearValue: (() => void) | null = null;

  function ValueHarness() {
    const [value, show, clear] = useTransientValue<string>(1000);
    latestValue = value;
    showValue = show;
    clearValue = clear;
    return null;
  }

  function FlagHarness() {
    const [value, show] = useTransientFlag(500);
    latestFlag = value;
    showFlag = show;
    return null;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    latestValue = null;
    latestFlag = false;
    showValue = null;
    showFlag = null;
    clearValue = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    vi.useRealTimers();
  });

  it('restarts the transient timer when a new value is shown', async () => {
    await act(async () => {
      root?.render(<ValueHarness />);
    });

    act(() => {
      showValue?.('first');
    });
    expect(latestValue).toBe('first');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    act(() => {
      showValue?.('second');
    });
    expect(latestValue).toBe('second');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(latestValue).toBe('second');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(latestValue).toBeNull();
  });

  it('supports flag-style feedback and manual clearing', async () => {
    await act(async () => {
      root?.render(
        <>
          <ValueHarness />
          <FlagHarness />
        </>,
      );
    });

    act(() => {
      showFlag?.();
      showValue?.('copied');
    });
    expect(latestFlag).toBe(true);
    expect(latestValue).toBe('copied');

    act(() => {
      clearValue?.();
    });
    expect(latestValue).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(latestFlag).toBe(false);
  });
});
