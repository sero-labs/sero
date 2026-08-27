// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThinkingBlock } from './ThinkingBlock';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });

describe('ThinkingBlock', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('stops following deltas when the reader scrolls up', async () => {
    await act(async () => root.render(<ThinkingBlock thinking="first" isStreaming />));
    const content = container.querySelector('pre');
    expect(content).not.toBeNull();
    Object.defineProperties(content, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1000 },
    });

    await act(async () => root.render(<ThinkingBlock thinking="first\nsecond" isStreaming />));
    expect(content?.scrollTop).toBe(1000);

    if (content) content.scrollTop = 200;
    await act(async () => content?.dispatchEvent(new Event('scroll', { bubbles: true })));
    await act(async () => root.render(<ThinkingBlock thinking="first\nsecond\nthird" isStreaming />));
    expect(content?.scrollTop).toBe(200);

    if (content) content.scrollTop = 800;
    await act(async () => content?.dispatchEvent(new Event('scroll', { bubbles: true })));
    await act(async () => root.render(<ThinkingBlock thinking="first\nsecond\nthird\nfourth" isStreaming />));
    expect(content?.scrollTop).toBe(1000);
  });

  it('keeps an explicit expansion after thinking finishes', async () => {
    await act(async () => root.render(<ThinkingBlock thinking="Reasoning" isStreaming />));
    const toggle = container.querySelector('button');
    await act(async () => toggle?.click());
    await act(async () => toggle?.click());

    await act(async () => root.render(<ThinkingBlock thinking="Reasoning" isStreaming={false} />));
    expect(container.querySelector('pre')?.textContent).toContain('Reasoning');
  });
});
