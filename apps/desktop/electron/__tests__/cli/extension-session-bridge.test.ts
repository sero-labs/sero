import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentSession,
  ExtensionContext,
  LoadExtensionsResult,
  RegisteredCommand,
  ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import {
  bridgeExtensionTools,
  getCliRegistry,
  resetCliRegistryForTests,
} from '@electron/cli';
import { CliRegistry } from '@electron/cli/core/registry';
import { bridgeTool } from '@electron/cli/core/schema-bridge';
import { createSeroCliTool } from '@electron/cli/core/tool';
import type { CliSessionRuntime } from '@electron/cli/core/types';
import { replaceBridgedExtensionSessionItems } from '@electron/cli/bridges/extension-session-bridge';
import { installCliSessionBridge } from '@electron/cli/bridges/session-bridge';
import { workspaceManager } from '@electron/shared/infra/shared-infra';

function installSessionBridge(
  sessionIds: string[],
  sendUserMessage = vi.fn(),
  sendCustomMessage = vi.fn(),
  sessionOverrides?: Partial<AgentSession>,
) {
  installCliSessionBridge({
    getSessionEntry: (sessionId) => {
      if (!sessionIds.includes(sessionId)) return undefined;
      return {
        sessionId,
        workspaceId: 'ws-1',
        session: {
          sendUserMessage,
          sendCustomMessage,
          ...sessionOverrides,
        } as unknown as AgentSession,
        lastSessionName: undefined,
      };
    },
    getActiveSessionForWorkspace: () => undefined,
    getActiveTurnId: () => null,
    noteTurnStart: () => {},
    noteTurnEnd: () => {},
    consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
    setSessionTitle: () => {},
  });

  return { sendUserMessage, sendCustomMessage };
}

function makeLoadExtensionsResult(options: {
  extensionPath: string;
  tools?: ToolDefinition[];
  commands?: RegisteredCommand[];
}): LoadExtensionsResult {
  return {
    extensions: [
      {
        path: options.extensionPath,
        resolvedPath: options.extensionPath,
        handlers: new Map(),
        tools: new Map((options.tools ?? []).map((definition) => [
          definition.name,
          {
            definition,
            extensionPath: options.extensionPath,
          },
        ])),
        messageRenderers: new Map(),
        commands: new Map((options.commands ?? []).map((command) => [command.name, command])),
        flags: new Map(),
        shortcuts: new Map(),
      },
    ],
    errors: [],
    runtime: {} as LoadExtensionsResult['runtime'],
  };
}

describe('bridged extension sessions', () => {
  beforeEach(() => {
    resetCliRegistryForTests();
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');
  });

  it('executes the current session tool definition instead of the first registered session', async () => {
    installSessionBridge(['session-1', 'session-2']);

    const session1Spy = vi.fn();
    const session2Spy = vi.fn();

    const tool1: ToolDefinition = {
      name: 'shared_tool',
      label: 'Shared Tool',
      description: 'Shared test tool.',
      parameters: Type.Object({ action: Type.String() }),
      execute: async () => {
        session1Spy();
        return { content: [{ type: 'text', text: 'session-1 tool' }], details: null };
      },
    };

    const tool2: ToolDefinition = {
      ...tool1,
      execute: async () => {
        session2Spy();
        return { content: [{ type: 'text', text: 'session-2 tool' }], details: null };
      },
    };

    const registry = new CliRegistry();
    registry.register(bridgeTool('shared_tool', tool1));
    replaceBridgedExtensionSessionItems(
      'session-1',
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-a/extension/index.ts',
        tools: [tool1],
      }).extensions,
    );
    replaceBridgedExtensionSessionItems(
      'session-2',
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-a/extension/index.ts',
        tools: [tool2],
      }).extensions,
    );

    const tool = createSeroCliTool(registry, 'ws-1', 'session-2');
    const result = await tool.execute(
      'tool-1',
      { command: 'shared_tool run' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(session1Spy).not.toHaveBeenCalled();
    expect(session2Spy).toHaveBeenCalledOnce();
    expect(result.content).toEqual([{ type: 'text', text: 'session-2 tool' }]);
  });

  it('executes the current session command handler instead of the first registered session', async () => {
    installSessionBridge(['session-1', 'session-2']);

    const session1Spy = vi.fn();
    const session2Spy = vi.fn();

    const command1: RegisteredCommand = {
      name: 'shared_command',
      description: 'Shared command.',
      handler: async (args) => {
        session1Spy(args);
      },
    };

    const command2: RegisteredCommand = {
      ...command1,
      handler: async (args) => {
        session2Spy(args);
      },
    };

    bridgeExtensionTools(
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-b/extension/index.ts',
        commands: [command1],
      }),
      { sessionId: 'session-1' },
    );
    bridgeExtensionTools(
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-b/extension/index.ts',
        commands: [command2],
      }),
      { sessionId: 'session-2' },
    );

    const tool = createSeroCliTool(getCliRegistry(), 'ws-1', 'session-2');
    const result = await tool.execute(
      'tool-1',
      { command: 'shared_command refresh status' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(session1Spy).not.toHaveBeenCalled();
    expect(session2Spy).toHaveBeenCalledWith('refresh status');
    expect(result.content).toEqual([{ type: 'text', text: '/shared_command executed' }]);
  });

  it('prefers the live session extensionRunner command so captured pi actions stay bound', async () => {
    const staleHandler = vi.fn(async () => {
      throw new Error('Extension runtime not initialized. Action methods cannot be called during extension loading.');
    });
    const liveHandler = vi.fn(async () => undefined);

    installSessionBridge(
      ['session-1'],
      vi.fn(),
      vi.fn(),
      {
        extensionRunner: {
          getCommand: (name: string) => (name === 'todos'
            ? {
                name: 'todos',
                description: 'Live todos command.',
                handler: liveHandler,
              }
            : undefined),
          createCommandContext: () => ({
            cwd: '/tmp/ws-1',
            hasUI: true,
            ui: {},
            waitForIdle: async () => {},
            newSession: async () => ({ cancelled: false }),
            fork: async () => ({ cancelled: false }),
            navigateTree: async () => ({ cancelled: false }),
            switchSession: async () => ({ cancelled: false }),
            reload: async () => {},
          }),
        } as unknown as AgentSession['extensionRunner'],
      },
    );

    bridgeExtensionTools(
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-c/extension/index.ts',
        commands: [
          {
            name: 'todos',
            description: 'Stale todos command.',
            handler: staleHandler,
          },
        ],
      }),
      { sessionId: 'session-1' },
    );

    const tool = createSeroCliTool(getCliRegistry(), 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'todos' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(staleHandler).not.toHaveBeenCalled();
    expect(liveHandler).toHaveBeenCalledWith('', expect.any(Object));
    expect(result.content).toEqual([{ type: 'text', text: '/todos executed' }]);
  });

  it('injects sessionRuntime into bridged command contexts', async () => {
    const { sendUserMessage } = installSessionBridge(['session-1']);

    const command: RegisteredCommand = {
      name: 'runtime_command',
      description: 'Runtime command.',
      handler: async (_args, ctx) => {
        const runtime = (ctx as ExtensionContext & { sessionRuntime?: CliSessionRuntime }).sessionRuntime;
        await runtime?.sendUserMessage('/memory list', { deliverAs: 'followUp' });
      },
    };

    bridgeExtensionTools(
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-c/extension/index.ts',
        commands: [command],
      }),
      { sessionId: 'session-1' },
    );

    const tool = createSeroCliTool(getCliRegistry(), 'ws-1', 'session-1');
    await tool.execute(
      'tool-1',
      { command: 'runtime_command' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(sendUserMessage).toHaveBeenCalledWith('/memory list', { deliverAs: 'followUp' });
  });

  it('prefers a bridged tool over a same-name slash command in the same session', async () => {
    installSessionBridge(['session-1']);

    const toolSpy = vi.fn<ToolDefinition['execute']>(async () => ({
      content: [{ type: 'text', text: 'memory tool executed' }],
      details: null,
    }));
    const commandSpy = vi.fn(async () => undefined);

    bridgeExtensionTools(
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-memory/extension/index.ts',
        tools: [{
          name: 'memory',
          label: 'Memory',
          description: 'Memory tool.',
          parameters: Type.Object({}),
          execute: toolSpy,
        }],
        commands: [{
          name: 'memory',
          description: 'Memory slash command.',
          handler: commandSpy,
        }],
      }),
      { sessionId: 'session-1' },
    );

    const tool = createSeroCliTool(getCliRegistry(), 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'memory write --target memory' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(toolSpy).toHaveBeenCalledOnce();
    expect(commandSpy).not.toHaveBeenCalled();
    expect(result.content).toEqual([{ type: 'text', text: 'memory tool executed' }]);
  });

  it('does not resolve another session\'s bridged commands', async () => {
    installSessionBridge(['session-1', 'session-2']);

    bridgeExtensionTools(
      makeLoadExtensionsResult({
        extensionPath: '/tmp/plugin-d/extension/index.ts',
        commands: [{
          name: 'session_two_only',
          description: 'Only available in session two.',
          handler: async () => undefined,
        }],
      }),
      { sessionId: 'session-2' },
    );

    const tool = createSeroCliTool(getCliRegistry(), 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'session_two_only' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(result.content).toEqual([{ type: 'text', text: 'ERROR: Unknown command: session_two_only' }]);
  });
});
