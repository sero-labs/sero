// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpResourcePreview } from '../../../shared/types';
import type { McpViewerState } from '../../hooks/useMcpViewer';
import { McpViewerPane } from './McpViewerPane';

const promptAgentMock = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  useAgentPrompt: () => promptAgentMock,
}));

vi.mock('./McpAuthBrowser', () => ({
  McpAuthBrowser: ({ src }: { src: string }) => <div>auth-browser:{src}</div>,
}));

vi.mock('./McpResourceViewer', () => ({
  McpResourceViewer: ({ kind }: { kind: string }) => <div>resource-viewer:{kind}</div>,
}));

describe('McpViewerPane', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    promptAgentMock.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
    promptAgentMock.mockReset();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('renders the auth browser in the dedicated auth pane and lets the user clear it', async () => {
    const clearPane = vi.fn();

    await act(async () => {
      root?.render(<McpViewerPane viewer={createViewerState({
        pane: { kind: 'auth', serverName: 'github', title: 'Authenticate github' },
        authSession: { serverName: 'github', authUrl: 'https://github.com/login/oauth/authorize' },
        clearPane,
      })} />);
    });

    expect(container.textContent).toContain('auth-browser:https://github.com/login/oauth/authorize');

    await act(async () => {
      clickButton(container, 'Clear pane');
    });

    expect(clearPane).toHaveBeenCalled();
  });

  it('uses Ask Sero recovery copy for viewer failures', async () => {
    const preview: McpResourcePreview = {
      serverName: 'github',
      requestedUri: 'file://README.md',
      resolvedUri: 'file://README.md',
      previewKind: 'text',
      text: 'hello',
      truncated: false,
    };

    await act(async () => {
      root?.render(<McpViewerPane viewer={createViewerState({
        pane: { kind: 'resource', serverName: 'github', title: 'README' },
        preview,
        activeResourceUri: 'file://README.md',
        resourceError: 'Preview failed',
      })} />);
    });

    await act(async () => {
      clickButton(container, 'Ask Sero to help');
    });

    expect(promptAgentMock).toHaveBeenCalledWith(expect.stringContaining('Server: github'));
    expect(promptAgentMock).toHaveBeenCalledWith(expect.stringContaining('file://README.md'));
  });
});

function createViewerState(overrides: Partial<McpViewerState>): McpViewerState {
  return {
    pane: null,
    session: null,
    preview: null,
    activeResourceUri: null,
    resourceLoading: false,
    resourceError: null,
    authSession: null,
    authLoading: false,
    authError: null,
    setAuthError: vi.fn(),
    openResource: vi.fn(async () => undefined),
    startAuth: vi.fn(async () => true),
    completeAuth: vi.fn(async () => true),
    cancelAuth: vi.fn(async () => true),
    clearAuth: vi.fn(async () => true),
    focusAuthSession: vi.fn(),
    clearPane: vi.fn(),
    ...overrides,
  };
}

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
