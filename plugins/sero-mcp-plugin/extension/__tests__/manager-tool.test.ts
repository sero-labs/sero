import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerMcpManagerTool } from '../tools/manager-tool';
import { createToolResult } from '../tools/types';
import type { McpRuntime } from '../runtime/mcp-runtime';

describe('registerMcpManagerTool', () => {
  it('accepts the status compatibility action and forwards it to the runtime', async () => {
    const registerTool = vi.fn();
    const pi = { registerTool } as unknown as ExtensionAPI;
    const executeManagerAction = vi.fn(async () => createToolResult('status ok'));
    const runtime = { executeManagerAction } as unknown as McpRuntime;

    registerMcpManagerTool(pi, runtime);

    const tool = registerTool.mock.calls[0]?.[0];
    if (!tool?.execute) {
      throw new Error('Failed to register MCP manager tool.');
    }

    const result = await tool.execute('tool-call-1', { action: 'status' }, null, () => undefined, { cwd: '/tmp/ws' });

    expect(executeManagerAction).toHaveBeenCalledWith('status', {
      cwd: '/tmp/ws',
      rawConfig: undefined,
      serverName: undefined,
      resourceUri: undefined,
      toolName: undefined,
      toolArguments: undefined,
      callbackUrl: undefined,
      serverInput: undefined,
    });
    expect(result.content[0]?.text).toBe('status ok');
  });

  it('uses the caller session from the extension context, not the model-supplied session', async () => {
    const registerTool = vi.fn();
    const executeManagerAction = vi.fn(async () => createToolResult('ok'));
    registerMcpManagerTool({ registerTool } as unknown as ExtensionAPI, { executeManagerAction } as unknown as McpRuntime);
    const tool = registerTool.mock.calls[0]?.[0];

    await tool.execute('tool-call-1', { action: 'read_resource', serverName: 'demo', resourceUri: 'file://x', sessionId: 'spoofed' }, null, () => undefined, {
      cwd: '/tmp/ws',
      sessionManager: { getSessionId: () => 'chat-1' },
    });

    expect(executeManagerAction).toHaveBeenLastCalledWith('read_resource', expect.objectContaining({
      sessionId: 'spoofed',
      callerSessionId: 'chat-1',
    }));
  });

  it('routes the MCP task actions with the task ID', async () => {
    const registerTool = vi.fn();
    const executeManagerAction = vi.fn(async () => createToolResult('ok'));
    registerMcpManagerTool({ registerTool } as unknown as ExtensionAPI, { executeManagerAction } as unknown as McpRuntime);
    const tool = registerTool.mock.calls[0]?.[0];

    for (const action of ['list_tasks', 'cancel_task', 'dismiss_task', 'task_result']) {
      await tool.execute('tool-call-1', { action, taskId: 'task-7' }, null, () => undefined, { cwd: '/tmp/ws' });
      expect(executeManagerAction).toHaveBeenLastCalledWith(action, expect.objectContaining({ taskId: 'task-7' }));
    }
  });
});
