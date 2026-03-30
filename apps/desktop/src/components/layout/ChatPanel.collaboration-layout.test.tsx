// @vitest-environment jsdom

import { act } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const resizableMocks = vi.hoisted(() => ({
  panelProps: [] as Array<{
    id?: string;
    defaultSize?: number | string;
    minSize?: number | string;
    hasOnResize: boolean;
  }>,
  reset() {
    this.panelProps = [];
  },
}));

vi.mock('@sero-ai/ui/components/ui/resizable', () => ({
  ResizablePanelGroup: ({
    children,
    id,
  }: {
    children: ReactNode;
    id?: string;
  }) => <div data-testid={id ?? 'panel-group'}>{children}</div>,
  ResizableHandle: (props: {
    children?: ReactNode;
    'data-testid'?: string;
  }) => (
    <div data-testid={props['data-testid'] ?? 'resizable-handle'}>
      {props.children}
    </div>
  ),
  ResizablePanel: ({
    children,
    id,
    defaultSize,
    minSize,
    onResize,
  }: {
    children: ReactNode;
    id?: string;
    defaultSize?: number | string;
    minSize?: number | string;
    onResize?: (...args: unknown[]) => void;
  }) => {
    resizableMocks.panelProps.push({
      id,
      defaultSize,
      minSize,
      hasOnResize: typeof onResize === 'function',
    });
    return <div data-testid={id ?? 'resizable-panel'}>{children}</div>;
  },
}));

import {
  ChatPanelCollaborationLayout,
  isCollaborationSectionVisible,
} from './ChatPanelCollaborationLayout';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatPanelCollaborationLayout', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  const onCollaborationResize = vi.fn();

  it('only keeps the resizable tray visible while collaboration is active', () => {
    expect(isCollaborationSectionVisible('idle')).toBe(false);
    expect(isCollaborationSectionVisible('research')).toBe(true);
    expect(isCollaborationSectionVisible('specialists')).toBe(true);
    expect(isCollaborationSectionVisible('synthesis')).toBe(true);
    expect(isCollaborationSectionVisible('error')).toBe(true);
    expect(isCollaborationSectionVisible('complete')).toBe(false);
  });

  beforeEach(() => {
    resizableMocks.reset();
    onCollaborationResize.mockReset();
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
    container.remove();
  });

  it('renders only the conversation when collaboration UI is hidden', async () => {
    await act(async () => {
      root?.render(
        <ChatPanelCollaborationLayout
          collaborationVisible={false}
          collaborationDefaultSizePct={35}
          onCollaborationResize={onCollaborationResize}
          conversation={<div>conversation content</div>}
          collaboration={<div>collaboration content</div>}
        />,
      );
    });

    expect(container.textContent).toContain('conversation content');
    expect(container.textContent).not.toContain('collaboration content');
    expect(container.querySelector('[data-testid="chat-panel-collaboration-handle"]')).toBeNull();
    expect(container.querySelector('[data-testid="chat-panel-collaboration-shell"]')).toBeNull();
    expect(resizableMocks.panelProps).toEqual([]);
  });

  it('renders a resizable collaboration shell when collaboration UI is visible', async () => {
    await act(async () => {
      root?.render(
        <ChatPanelCollaborationLayout
          collaborationVisible
          collaborationDefaultSizePct={38}
          onCollaborationResize={onCollaborationResize}
          conversation={<div>conversation content</div>}
          collaboration={<div>collaboration content</div>}
        />,
      );
    });

    expect(container.querySelector('[data-testid="chat-panel-collaboration-layout"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-panel-collaboration-handle"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-panel-collaboration-shell"]')).not.toBeNull();
    expect(container.textContent).toContain('conversation content');
    expect(container.textContent).toContain('collaboration content');
    expect(resizableMocks.panelProps).toEqual([
      {
        id: 'chat-panel-conversation',
        defaultSize: undefined,
        minSize: 35,
        hasOnResize: false,
      },
      {
        id: 'chat-panel-collaboration',
        defaultSize: '38%',
        minSize: 18,
        hasOnResize: true,
      },
    ]);
  });
});
