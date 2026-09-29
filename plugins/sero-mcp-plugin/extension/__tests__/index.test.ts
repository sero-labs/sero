import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { SESSION_CLI_SURFACE_EVENT } from '@sero-ai/common';
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
      getAllTools: () => [],
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

  it('adds no MCP guidance to a session that has the mcp tool directly', async () => {
    const on = vi.fn();
    const pi = {
      registerTool: vi.fn(),
      on,
      getActiveTools: () => ['sero-cli', 'mcp'],
      getAllTools: () => [{ name: 'mcp' }],
    } as unknown as ExtensionAPI;

    mcpExtension(pi);

    const beforeAgentStart = on.mock.calls.find(([eventName]) => eventName === 'before_agent_start')?.[1] as
      (event: { systemPrompt: string }) => Promise<unknown>;

    expect(await beforeAgentStart({ systemPrompt: 'BASE' })).toBeUndefined();
  });

  it('adds no MCP guidance when the session registry hides the mcp command', async () => {
    const on = vi.fn();
    const eventHandlers = new Map<string, (data: unknown) => void>();
    const pi = {
      registerTool: vi.fn(),
      on,
      getActiveTools: () => ['sero-cli'],
      getAllTools: () => [],
      events: {
        on: (channel: string, handler: (data: unknown) => void) => { eventHandlers.set(channel, handler); },
      },
    } as unknown as ExtensionAPI;

    mcpExtension(pi);
    // A restricted subagent names `sero-cli` but the allowlist keeps `mcp` out
    // of its registry, so the hint would name a command it cannot run.
    eventHandlers.get(SESSION_CLI_SURFACE_EVENT)?.({ commands: ['read', 'bash', 'sero-cli'] });

    const beforeAgentStart = on.mock.calls.find(([eventName]) => eventName === 'before_agent_start')?.[1] as
      (event: { systemPrompt: string }) => Promise<unknown>;

    expect(await beforeAgentStart({ systemPrompt: 'BASE' })).toBeUndefined();
  });
});
