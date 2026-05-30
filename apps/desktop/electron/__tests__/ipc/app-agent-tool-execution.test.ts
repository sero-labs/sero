import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

import { invokeAppSessionTool } from '@electron/ipc/agent/handlers/app-agent-tools';

describe('invokeAppSessionTool', () => {
  it('executes the live app-session tool definition with the extension context', async () => {
    const execute = vi.fn(async () => ({
      content: [{ type: 'text', text: '{"ok":true}' }],
      details: { ok: true },
    }));
    const toolContext = { cwd: '/tmp/ws-1', hasUI: true };

    const session = {
      extensionRunner: {
        getToolDefinition: vi.fn(() => ({ execute })),
        createContext: vi.fn(() => toolContext),
      },
    } as unknown as AgentSession;

    const result = await invokeAppSessionTool(session, 'plugin_ping', { value: 42 });

    expect(execute).toHaveBeenCalledWith(
      'app-tool-bridge',
      { value: 42 },
      undefined,
      undefined,
      toolContext,
    );
    expect(result).toEqual({
      text: '{"ok":true}',
      content: [{ type: 'text', text: '{"ok":true}' }],
      details: { ok: true },
      isError: false,
    });
  });

  it('returns a normalized error result when the app session has no matching tool', async () => {
    const session = {
      extensionRunner: {
        getToolDefinition: vi.fn(() => undefined),
        createContext: vi.fn(),
      },
    } as unknown as AgentSession;

    const result = await invokeAppSessionTool(session, 'missing_tool', {});

    expect(result).toEqual({
      text: 'Error: App tool not found: missing_tool',
      content: [{ type: 'text', text: 'Error: App tool not found: missing_tool' }],
      details: null,
      isError: true,
    });
  });
});
