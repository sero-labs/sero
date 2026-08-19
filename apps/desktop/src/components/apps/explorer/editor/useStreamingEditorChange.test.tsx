// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamingEditorChange } from './useStreamingEditorChange';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('useStreamingEditorChange', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let latestListener: (value: string | undefined) => void = () => {};
  const onChange = vi.fn();

  function Harness({ streaming }: { streaming: boolean }) {
    latestListener = useStreamingEditorChange(streaming, onChange);
    return null;
  }

  beforeEach(() => {
    onChange.mockReset();
    latestListener = () => {};
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
  });

  it('ignores a stale Monaco listener after streaming starts', async () => {
    await act(async () => {
      root?.render(<Harness streaming={false} />);
    });
    const staleListener = latestListener;

    staleListener('user edit');
    await act(async () => {
      root?.render(<Harness streaming />);
    });
    staleListener('agent content');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('user edit');
  });

  it('forwards changes again after streaming stops', async () => {
    await act(async () => {
      root?.render(<Harness streaming />);
    });

    latestListener('agent content');
    await act(async () => {
      root?.render(<Harness streaming={false} />);
    });
    latestListener('user edit');

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith('user edit');
  });
});
