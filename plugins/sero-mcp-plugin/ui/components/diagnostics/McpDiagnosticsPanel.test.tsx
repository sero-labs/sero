// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { McpDiagnosticsPanel } from './McpDiagnosticsPanel';

const promptAgentMock = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  useAgentPrompt: () => promptAgentMock,
}));

describe('McpDiagnosticsPanel', () => {
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

  it('stays hidden until diagnostics are opened', async () => {
    await act(async () => {
      root?.render(
        <McpDiagnosticsPanel
          state={{
            loading: false,
            error: null,
            isOpen: false,
            diagnostics: '',
            open: vi.fn(async () => undefined),
            close: vi.fn(),
            refresh: vi.fn(async () => undefined),
          }}
        />,
      );
    });

    expect(container.textContent).toBe('');
  });

  it('sends the current diagnostics to Ask Sero', async () => {
    await act(async () => {
      root?.render(
        <McpDiagnosticsPanel
          state={{
            loading: false,
            error: null,
            isOpen: true,
            diagnostics: 'server github failed to authenticate',
            open: vi.fn(async () => undefined),
            close: vi.fn(),
            refresh: vi.fn(async () => undefined),
          }}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Ask Sero to help');
    });

    expect(promptAgentMock).toHaveBeenCalledWith(expect.stringContaining('server github failed to authenticate'));
  });
});

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}
