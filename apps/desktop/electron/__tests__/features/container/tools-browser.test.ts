import { describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '@mariozechner/pi-coding-agent';

const createAgentBrowserMock = vi.fn();

vi.mock('@electron/features/container/tools/tools-browser-agent', () => ({
  createAgentBrowser: createAgentBrowserMock,
}));

describe('createBrowser', () => {
  it('delegates to the agent-browser backend', async () => {
    const execute = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'agent-ok' }],
      details: undefined,
    });

    createAgentBrowserMock.mockReturnValue({
      name: 'automation_browser',
      label: 'automation_browser',
      description: 'agent',
      parameters: { type: 'object', properties: {} },
      execute,
    } as unknown as ToolDefinition);

    const { createBrowser } = await import('@electron/features/container/tools/tools-browser');
    const tool = createBrowser({} as never, 'ws-1');
    const result = await tool.execute('id', { action: 'wait' }, undefined, undefined, undefined as never);

    expect(createAgentBrowserMock).toHaveBeenCalledTimes(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'agent-ok' });
  });
});
