// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoScroll } from './CollaborationFeedItems';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ feedLen }: { feedLen: number }) {
  const scrollRef = useAutoScroll(feedLen);
  return <div ref={scrollRef} />;
}

describe('useAutoScroll', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let rafCallbacks: FrameRequestCallback[];
  let requestAnimationFrameSpy: ReturnType<typeof vi.fn>;
  let cancelAnimationFrameSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rafCallbacks = [];
    requestAnimationFrameSpy = vi.fn((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    cancelAnimationFrameSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrameSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy);

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
    vi.unstubAllGlobals();
  });

  it('schedules scrolling after commit and only when the feed length changes', async () => {
    await act(async () => {
      root?.render(<Harness feedLen={2} />);
    });

    const scroller = container.querySelector('div');
    expect(scroller).toBeTruthy();
    if (!scroller) {
      throw new Error('Expected scroller element');
    }

    Object.defineProperty(scroller, 'scrollHeight', {
      configurable: true,
      value: 240,
    });

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);
    expect(scroller.scrollTop).toBe(0);

    rafCallbacks[0]?.(0);
    expect(scroller.scrollTop).toBe(240);

    await act(async () => {
      root?.render(<Harness feedLen={2} />);
    });
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      root?.render(<Harness feedLen={3} />);
    });
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2);
  });
});
