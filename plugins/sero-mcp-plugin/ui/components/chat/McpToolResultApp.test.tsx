// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const run = vi.fn();
vi.mock('@sero-ai/app-runtime', () => ({ useAppTools: () => ({ run }) }));

import McpToolResultApp from './McpToolResultApp';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const details = {
  seroToolResultView: { appId: 'mcp', contributionId: 'mcp-app' },
  mcpApp: {
    serverName: 'sales',
    toolName: 'show_dashboard',
    uiResourceUri: 'ui://sales/dashboard',
    arguments: { region: 'EMEA' },
    result: { content: [{ type: 'text', text: '4 rows' }] },
  },
};

describe('McpToolResultApp', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    run.mockReset();
  });

  afterEach(() => {
    container.remove();
  });

  it('opens a viewer for the stored call, shows it, and closes it on unmount', async () => {
    run.mockImplementation(async (_tool: string, params: { action: string }) => (
      params.action === 'open_tool_ui'
        ? { text: 'Opened', isError: false, details: { viewerId: 'viewer-1', viewerUrl: 'http://127.0.0.1:4000/?session=viewer-1' } }
        : { text: 'Closed', isError: false, details: {} }
    ));

    await act(async () => root.render(<McpToolResultApp sessionId="chat-1" toolCallId="call-1" details={details} isError={false} />));

    expect(run).toHaveBeenCalledWith('mcp_manager', {
      action: 'open_tool_ui',
      serverName: 'sales',
      toolName: 'show_dashboard',
      resourceUri: 'ui://sales/dashboard',
      toolArguments: { region: 'EMEA' },
      toolResult: { content: [{ type: 'text', text: '4 rows' }] },
      sessionId: 'chat-1',
      toolCallId: 'call-1',
    });
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('http://127.0.0.1:4000/?session=viewer-1');

    await act(async () => root.unmount());
    expect(run).toHaveBeenLastCalledWith('mcp_manager', { action: 'close_viewer', viewerId: 'viewer-1' });
  });

  it('shows one line with the reason when the app cannot be shown', async () => {
    run.mockResolvedValue({
      text: 'Error: Failed to open MCP tool UI "show_dashboard". Resource is not HTML.',
      isError: true,
      details: { reason: 'Resource is not HTML.' },
    });

    await act(async () => root.render(<McpToolResultApp sessionId="chat-1" toolCallId="call-1" details={details} isError={false} />));

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toBe('App not shown: Resource is not HTML.');
    await act(async () => root.unmount());
  });
});
