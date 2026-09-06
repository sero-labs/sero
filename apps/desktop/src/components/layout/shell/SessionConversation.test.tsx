import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationContent } from '@sero-ai/ui/ai-elements/conversation';
import type { ChatAssistantMessage } from '@/types/ipc';
import { SessionConversation } from './SessionConversation';

let container: HTMLDivElement;
let root: Root;
let contentHeight: number;
const observers = new Map<Element, ResizeObserverCallback>();

class TestResizeObserver implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) { observers.set(target, this.callback); }
  unobserve(target: Element) { observers.delete(target); }
  disconnect() {
    for (const [target, callback] of observers) {
      if (callback === this.callback) observers.delete(target);
    }
  }
}

function message(text: string): ChatAssistantMessage {
  return { id: text, type: 'assistant', text, isStreaming: false };
}

function renderChat(session: string, messages: ChatAssistantMessage[], isStreaming = false) {
  act(() => root.render(
    <SessionConversation key={session} messages={messages} isStreaming={isStreaming}>
      {(initialScrollToEnd) => (
        <ConversationContent data-testid="content" data-initial-scroll-to-end={initialScrollToEnd}>
          {messages.map((item) => item.text).join(' ')}
        </ConversationContent>
      )}
    </SessionConversation>,
  ));
}

async function resize(height: number) {
  contentHeight = height;
  await act(async () => {
    for (const [target, callback] of observers) {
      const entry: ResizeObserverEntry = {
        target,
        contentRect: new DOMRect(0, 0, 400, height),
        borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [],
      };
      callback([entry], new TestResizeObserver(callback));
    }
    await vi.advanceTimersByTimeAsync(48);
  });
}

function scrollTop() {
  return container.querySelector('[data-testid="content"]')!.parentElement!.scrollTop;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  contentHeight = 0;
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  observers.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SessionConversation', () => {
  it('jumps to loaded history through later measurements, then animates new messages', async () => {
    renderChat('a', []);
    await resize(200);
    const history = [message('Loaded message')];
    renderChat('a', history);
    await resize(1000);
    expect(scrollTop()).toBe(799);
    await resize(1400);
    expect(scrollTop()).toBe(1199);

    renderChat('a', [...history, message('New message')]);
    await resize(1800);
    expect(scrollTop()).toBeGreaterThan(1199);
    expect(scrollTop()).toBeLessThan(1599);
  });

  it('keeps auto-scroll animated for the first live message in an empty chat', async () => {
    renderChat('new', []);
    await resize(200);
    renderChat('new', [message('First live message')], true);
    expect(container.querySelector('[data-testid="content"]')?.getAttribute('data-initial-scroll-to-end')).toBe('false');
    await resize(1000);
    expect(scrollTop()).toBeGreaterThan(0);
    expect(scrollTop()).toBeLessThan(799);
  });

  it('resets to instant on each cached session visit and animates streaming updates', async () => {
    const history = [message('Cached message')];
    renderChat('a', history, true);
    expect(container.querySelector('[data-testid="content"]')?.getAttribute('data-initial-scroll-to-end')).toBe('true');
    await resize(1000);
    expect(scrollTop()).toBe(799);
    await resize(1400);
    expect(scrollTop()).toBe(1199);

    renderChat('b', [message('Other session')]);
    await resize(1000);
    renderChat('a', history, true);
    await resize(1400);
    expect(scrollTop()).toBe(1199);

    renderChat('a', [{ ...history[0], text: 'Cached message continues' }], true);
    await resize(1800);
    expect(scrollTop()).toBeGreaterThan(1199);
    expect(scrollTop()).toBeLessThan(1599);
  });
});
