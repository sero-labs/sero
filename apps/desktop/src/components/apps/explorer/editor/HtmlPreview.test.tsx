// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { HtmlPreview } from './HtmlPreview';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HtmlPreview', () => {
  let container: HTMLDivElement;
  let root: Root;
  const createObjectUrl = vi.fn(() => `blob:preview-${createObjectUrl.mock.calls.length}`);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00Z'));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: vi.fn(),
    });
    createObjectUrl.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('limits iframe reloads while streamed content changes', async () => {
    await act(async () => root.render(
      <HtmlPreview content="first" filePath="preview.html" streaming />,
    ));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<HtmlPreview content="second" filePath="preview.html" streaming />);
      root.render(<HtmlPreview content="third" filePath="preview.html" streaming />);
    });
    expect(createObjectUrl).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-08-22T12:00:05Z'));
    await act(async () => root.render(
      <HtmlPreview content="fourth" filePath="preview.html" streaming />,
    ));
    expect(createObjectUrl).toHaveBeenCalledTimes(2);

    await act(async () => root.render(
      <HtmlPreview content="final" filePath="preview.html" streaming={false} />,
    ));
    expect(createObjectUrl).toHaveBeenCalledTimes(3);
  });
});
