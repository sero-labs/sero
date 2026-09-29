import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import mcpExtension from '../index';

describe('mcp extension registration', () => {
  it('registers the preferred mcp tool before the manager tool', () => {
    const registerTool = vi.fn();
    const on = vi.fn();
    const pi = {
      registerTool,
      on,
    } as unknown as ExtensionAPI;

    mcpExtension(pi);

    expect(registerTool.mock.calls[0]?.[0]?.name).toBe('mcp');
    expect(registerTool.mock.calls[1]?.[0]?.name).toBe('mcp_manager');
  });

  it('injects MCP routing guidance into before_agent_start', async () => {
    const registerTool = vi.fn();
    const on = vi.fn();
    const pi = {
      registerTool,
      on,
      getActiveTools: () => ['sero-cli'],
    } as unknown as ExtensionAPI;

    mcpExtension(pi);

    const beforeAgentStart = on.mock.calls.find(([eventName]) => eventName === 'before_agent_start')?.[1] as
      | ((event: { systemPrompt: string }) => Promise<{ systemPrompt: string }>)
      | undefined;

    expect(beforeAgentStart).toBeTypeOf('function');

    const result = await beforeAgentStart?.({ systemPrompt: 'BASE' });

    expect(result?.systemPrompt).toContain('BASE');
    expect(result?.systemPrompt).toContain('Run `sero mcp` for status, discovery, tool calls and resource reads');
    expect(result?.systemPrompt).toContain('Run `sero mcp_manager` only to add, remove, connect or authenticate servers');
  });

  it('adds no MCP guidance to a session that has no sero-cli tool', async () => {
    const on = vi.fn();
    const pi = {
      registerTool: vi.fn(),
      on,
      getActiveTools: () => ['read', 'bash'],
    } as unknown as ExtensionAPI;

    mcpExtension(pi);

    const beforeAgentStart = on.mock.calls.find(([eventName]) => eventName === 'before_agent_start')?.[1] as
      (event: { systemPrompt: string }) => Promise<unknown>;

    expect(await beforeAgentStart({ systemPrompt: 'BASE' })).toBeUndefined();
  });
});
