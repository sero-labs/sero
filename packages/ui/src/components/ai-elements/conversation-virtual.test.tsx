import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Conversation, ConversationContent } from './conversation';
import { ConversationVirtualList } from './conversation-virtual';

function Chat({ session, items, initialScrollToEnd = false }: { session: string; items: string[]; initialScrollToEnd?: boolean }) {
  return (
    <Conversation key={session} initial="instant">
      <ConversationContent>
        {items.length > 0 && (
          <ConversationVirtualList
            initialScrollToEnd={initialScrollToEnd}
            items={items}
            getItemKey={(item) => item}
            renderItem={(item) => <p>{item}</p>}
          />
        )}
      </ConversationContent>
    </Conversation>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ConversationVirtualList', () => {
  it('hides initial measurement jumps and reveals only a stable bottom position', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    let height = 1200;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    act(() => root.render(<Chat session="a" items={['Last message']} initialScrollToEnd />));
    const list = container.querySelector('[data-index]')!.parentElement!;
    const scroller = container.querySelector('[role="log"]')!.firstElementChild!;
    const advanceFrame = () => act(() => {
      const pending = frames.splice(0);
      pending.forEach((callback) => callback(0));
    });

    expect(list.style.visibility).toBe('hidden');
    advanceFrame();
    expect(scroller.scrollTop).toBe(599);
    height = 1800;
    advanceFrame();
    expect(scroller.scrollTop).toBe(1199);
    expect(list.style.visibility).toBe('hidden');
    advanceFrame();
    expect(list.style.visibility).toBe('hidden');
    advanceFrame();
    expect(list.style.visibility).toBe('');

    scroller.scrollTop = 200;
    act(() => root.render(<Chat session="a" items={['Last message', 'New message']} initialScrollToEnd />));
    advanceFrame();
    expect(scroller.scrollTop).toBe(200);
    expect(list.style.visibility).toBe('');
  });

  it('shows cached messages after switching away and returning', () => {
    act(() => root.render(<Chat session="a" items={[]} />));
    act(() => root.render(<Chat session="a" items={['Session A message']} />));
    expect(container.textContent).toContain('Session A message');

    act(() => root.render(<Chat session="b" items={[]} />));
    act(() => root.render(<Chat session="b" items={['Session B message']} />));
    expect(container.textContent).toContain('Session B message');

    act(() => root.render(<Chat session="a" items={['Session A message']} />));
    expect(container.textContent).toContain('Session A message');
    expect(container.textContent).not.toContain('Session B message');
  });
});
