import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerMcpProxyTool } from '../tools/proxy-tool';
import { createToolResult } from '../tools/types';
import type { McpRuntime } from '../runtime/mcp-runtime';

describe('registerMcpProxyTool CLI bridge', () => {
  it('defaults to proxy status when no subcommand is provided', async () => {
    const { tool, runtime } = registerTool();
    runtime.executeProxyAction.mockResolvedValue(createToolResult('status ok'));

    const result = await tool.cli.execute([], { cwd: '/tmp/ws' });

    expect(runtime.executeProxyAction).toHaveBeenCalledWith('status', {
      cwd: '/tmp/ws',
      query: undefined,
      serverName: undefined,
      toolName: undefined,
      resourceUri: undefined,
      toolArguments: undefined,
      argumentsJson: undefined,
    });
    expect(result).toEqual({ output: 'status ok', exitCode: 0 });
  });

  it('accepts action-style aliases for tool discovery commands', async () => {
    const { tool, runtime } = registerTool();
    runtime.executeProxyAction.mockResolvedValue(createToolResult('tools ok'));

    const result = await tool.cli.execute(['list_tools', 'context7'], { cwd: '/tmp/ws' });

    expect(runtime.executeProxyAction).toHaveBeenCalledWith('list_tools', {
      cwd: '/tmp/ws',
      query: undefined,
      serverName: 'context7',
      toolName: undefined,
      resourceUri: undefined,
      toolArguments: undefined,
      argumentsJson: undefined,
    });
    expect(result).toEqual({ output: 'tools ok', exitCode: 0 });
  });

  it('routes resource reads through the proxy runtime action', async () => {
    const { tool, runtime } = registerTool();
    runtime.executeProxyAction.mockResolvedValue(createToolResult('resource ok'));

    const result = await tool.cli.execute(['read', 'github', 'file://README.md'], { cwd: '/tmp/ws' });

    expect(runtime.executeProxyAction).toHaveBeenCalledWith('read_resource', {
      cwd: '/tmp/ws',
      query: undefined,
      serverName: 'github',
      toolName: undefined,
      resourceUri: 'file://README.md',
      toolArguments: undefined,
      argumentsJson: undefined,
    });
    expect(result).toEqual({ output: 'resource ok', exitCode: 0 });
  });

  it('routes connect through the manager runtime action', async () => {
    const { tool, runtime } = registerTool();
    runtime.executeManagerAction.mockResolvedValue(createToolResult('connected'));

    const result = await tool.cli.execute(['connect_server', 'github'], { cwd: '/tmp/ws' });

    expect(runtime.executeManagerAction).toHaveBeenCalledWith('connect_server', {
      cwd: '/tmp/ws',
      serverName: 'github',
    });
    expect(result).toEqual({ output: 'connected', exitCode: 0 });
  });

  it('routes direct tool connect actions through the manager runtime action', async () => {
    const { tool, runtime } = registerTool();
    runtime.executeManagerAction.mockResolvedValue(createToolResult('connected'));

    const result = await tool.execute('call-1', { action: 'connect', serverName: 'github' }, null, () => undefined, { cwd: '/tmp/ws' });

    expect(runtime.executeManagerAction).toHaveBeenCalledWith('connect_server', {
      cwd: '/tmp/ws',
      serverName: 'github',
    });
    expect(result.content[0]?.text).toBe('connected');
  });

  it('returns a usage error without touching the runtime when required args are missing', async () => {
    const { tool, runtime } = registerTool();

    const result = await tool.cli.execute(['read_resource', 'github'], { cwd: '/tmp/ws' });

    expect(runtime.executeProxyAction).not.toHaveBeenCalled();
    expect(runtime.executeManagerAction).not.toHaveBeenCalled();
    expect(result).toEqual({ output: 'Usage: sero mcp read <server> <resourceUri>', exitCode: 1 });
  });

  it('returns an unknown-subcommand error instead of silently falling back to status', async () => {
    const { tool, runtime } = registerTool();

    const result = await tool.cli.execute(['list-toolz', 'context7'], { cwd: '/tmp/ws' });

    expect(runtime.executeProxyAction).not.toHaveBeenCalled();
    expect(runtime.executeManagerAction).not.toHaveBeenCalled();
    expect(result).toEqual({ output: 'Unknown MCP subcommand: list-toolz. Use `sero help mcp` for usage.', exitCode: 1 });
  });
});

function registerTool() {
  const registerTool = vi.fn();
  const pi = { registerTool } as unknown as ExtensionAPI;
  const executeProxyAction = vi.fn();
  const executeManagerAction = vi.fn();
  const runtime = {
    executeProxyAction,
    executeManagerAction,
  } as unknown as McpRuntime;

  registerMcpProxyTool(pi, runtime);

  const tool = registerTool.mock.calls[0]?.[0];
  if (!tool?.cli) {
    throw new Error('Failed to register MCP proxy tool CLI definition.');
  }

  return {
    tool: tool as {
      cli: {
        execute: (args: string[], ctx: { cwd: string }) => Promise<{ output: string; exitCode: number }>;
      };
      execute: (
        toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | null,
        onUpdate: () => void,
        ctx?: { cwd?: string },
      ) => Promise<{ content: Array<{ type: 'text'; text: string }>; details: Record<string, unknown> }>;
    },
    runtime: {
      executeProxyAction,
      executeManagerAction,
    },
  };
}
