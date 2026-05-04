import { describe, expect, it, vi } from 'vitest';
import { Type } from 'typebox';

import { bridgeTool } from '@electron/cli/core/schema-bridge';
import type { CliCommandContext, CliInvocation } from '@electron/cli/core/types';
import { defineTool, type ExtensionContext, type ToolDefinition } from '@mariozechner/pi-coding-agent';
import type { ContainerManager } from '@electron/features/container';
import type { WorkspaceManager } from '@electron/features/workspace/manager';

function createMockToolDef(
  executeFn: ToolDefinition['execute'],
): ToolDefinition {
  return defineTool({
    name: 'test-tool',
    label: 'Test Tool',
    description: 'A test tool.',
    parameters: Type.Object({
      input: Type.String({ description: 'Test input' }),
    }),
    execute: executeFn as ToolDefinition['execute'],
  });
}

/** Minimal successful tool result that satisfies AgentToolResult. */
function okResult(text = 'ok') {
  return { content: [{ type: 'text' as const, text }], details: null };
}

function createMockInvocation(): CliInvocation {
  return {
    workspaceId: 'ws-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    source: 'tool',
  };
}

function createMockAgentContext(): Omit<ExtensionContext, 'cwd'> {
  return {
    model: { id: 'claude-sonnet', api: 'anthropic-messages', provider: 'anthropic' } as ExtensionContext['model'],
    modelRegistry: { getApiKeyAndHeaders: vi.fn() } as unknown as ExtensionContext['modelRegistry'],
    sessionManager: { getSessionId: vi.fn(() => 'sid-1') } as unknown as ExtensionContext['sessionManager'],
    hasUI: true,
    ui: { notify: vi.fn() } as unknown as ExtensionContext['ui'],
    isIdle: () => true,
    signal: undefined,
    abort: vi.fn(),
    hasPendingMessages: () => false,
    shutdown: vi.fn(),
    getContextUsage: () => undefined,
    compact: vi.fn(),
    getSystemPrompt: () => '',
  };
}

function createCliContext(agentContext?: Omit<ExtensionContext, 'cwd'>): CliCommandContext {
  return {
    workspaceId: 'ws-1',
    cwd: '/tmp/workspace',
    invocation: createMockInvocation(),
    workspaceManager: {} as WorkspaceManager,
    containerManager: {} as ContainerManager,
    agentContext,
  };
}

describe('bridgeTool agent context forwarding', () => {
  it('passes the full ExtensionContext (agentContext + cwd) to the tool execute', async () => {
    let receivedCtx: ExtensionContext | undefined;

    const toolDef = createMockToolDef(
      async (_id, _params, _signal, _onUpdate, ctx) => {
        receivedCtx = ctx;
        return okResult();
      },
    );

    const agentContext = createMockAgentContext();
    const cmd = bridgeTool('test-tool', toolDef);
    const cliCtx = createCliContext(agentContext);

    await cmd.execute(['--input', 'hello'], cliCtx);

    expect(receivedCtx).toBeDefined();
    expect(receivedCtx!.cwd).toBe('/tmp/workspace');
    expect(receivedCtx!.model).toBe(agentContext.model);
    expect(receivedCtx!.modelRegistry).toBe(agentContext.modelRegistry);
    expect(receivedCtx!.sessionManager).toBe(agentContext.sessionManager);
    expect(receivedCtx!.hasUI).toBe(true);
    expect(receivedCtx!.isIdle()).toBe(true);
  });

  it('passes a bare {cwd} context when no agentContext is available', async () => {
    let receivedCtx: ExtensionContext | undefined;

    const toolDef = createMockToolDef(
      async (_id, _params, _signal, _onUpdate, ctx) => {
        receivedCtx = ctx;
        return okResult();
      },
    );

    const cmd = bridgeTool('test-tool', toolDef);
    const cliCtx = createCliContext(/* no agentContext */);

    await cmd.execute(['--input', 'hello'], cliCtx);

    expect(receivedCtx).toBeDefined();
    expect(receivedCtx!.cwd).toBe('/tmp/workspace');
    // Without agentContext, model should be undefined (bare context)
    expect(receivedCtx!.model).toBeUndefined();
  });

  it('preserves model and modelRegistry for tools that need LLM access', async () => {
    const mockGetApiKeyAndHeaders = vi.fn().mockResolvedValue({ ok: true, apiKey: 'sk-test-123' });
    const agentContext = createMockAgentContext();
    agentContext.modelRegistry = { getApiKeyAndHeaders: mockGetApiKeyAndHeaders } as unknown as ExtensionContext['modelRegistry'];

    let capturedRegistry: ExtensionContext['modelRegistry'] | undefined;

    const toolDef = createMockToolDef(
      async (_id, _params, _signal, _onUpdate, ctx) => {
        capturedRegistry = ctx.modelRegistry;
        return okResult();
      },
    );

    const cmd = bridgeTool('test-tool', toolDef);
    await cmd.execute(['--input', 'test'], createCliContext(agentContext));

    expect(capturedRegistry).toBe(agentContext.modelRegistry);
    // Verify the registry is the same object (not a copy)
    await capturedRegistry!.getApiKeyAndHeaders({ provider: 'anthropic', id: 'claude-sonnet' } as NonNullable<ExtensionContext['model']>);
    expect(mockGetApiKeyAndHeaders).toHaveBeenCalledOnce();
  });
});
