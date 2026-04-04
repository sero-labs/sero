import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSession, ExtensionContext } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { CliRegistry } from '../../cli/core/registry';
import { bridgeTool } from '../../cli/core/schema-bridge';
import { createSeroCliTool } from '../../cli/core/tool';
import type { CliSessionRuntime } from '../../cli/core/types';
import { installCliSessionBridge } from '../../cli/bridges/session-bridge';
import { workspaceManager } from '../../shared/infra/shared-infra';

describe('CLI session runtime bridge', () => {
  beforeEach(() => {
    vi.spyOn(workspaceManager, 'getPath').mockReturnValue('/tmp/ws-1');
  });

  it('lets bridged tools send user messages through the current session runtime', async () => {
    const sendUserMessage = vi.fn().mockResolvedValue(undefined);
    const sendCustomMessage = vi.fn().mockResolvedValue(undefined);

    installCliSessionBridge({
      getSessionEntry: () => ({
        sessionId: 'session-1',
        workspaceId: 'ws-1',
        session: {
          sendUserMessage,
          sendCustomMessage,
        } as unknown as AgentSession,
        lastSessionName: undefined,
      }),
      getActiveSessionForWorkspace: () => undefined,
      getActiveTurnId: () => null,
      noteTurnStart: () => {},
      noteTurnEnd: () => {},
      consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
      setSessionTitle: () => {},
    });

    const registry = new CliRegistry();
    registry.register(bridgeTool('kanban', {
      name: 'kanban',
      label: 'Kanban',
      description: 'Manage the kanban board.',
      parameters: Type.Object({ action: Type.String() }),
      execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
        const runtime = (ctx as ExtensionContext & { sessionRuntime?: CliSessionRuntime }).sessionRuntime;
        await runtime?.sendUserMessage('/brainstorm', { deliverAs: 'followUp' });
        return {
          content: [{ type: 'text', text: 'queued' }],
          details: null,
        };
      },
    }));

    const tool = createSeroCliTool(registry, 'ws-1', 'session-1');
    const result = await tool.execute(
      'tool-1',
      { command: 'kanban brainstorm' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(sendUserMessage).toHaveBeenCalledWith('/brainstorm', { deliverAs: 'followUp' });
    expect(result.content).toEqual([{ type: 'text', text: 'queued' }]);
  });

  it('lets bridged tools send custom messages through the current session runtime', async () => {
    const sendUserMessage = vi.fn().mockResolvedValue(undefined);
    const sendCustomMessage = vi.fn().mockResolvedValue(undefined);

    installCliSessionBridge({
      getSessionEntry: () => ({
        sessionId: 'session-1',
        workspaceId: 'ws-1',
        session: {
          sendUserMessage,
          sendCustomMessage,
        } as unknown as AgentSession,
        lastSessionName: undefined,
      }),
      getActiveSessionForWorkspace: () => undefined,
      getActiveTurnId: () => null,
      noteTurnStart: () => {},
      noteTurnEnd: () => {},
      consumeTurnBudget: () => ({ allowed: true, count: 0, limit: 50 }),
      setSessionTitle: () => {},
    });

    const registry = new CliRegistry();
    registry.register(bridgeTool('kanban', {
      name: 'kanban',
      label: 'Kanban',
      description: 'Manage the kanban board.',
      parameters: Type.Object({ action: Type.String() }),
      execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
        const runtime = (ctx as ExtensionContext & { sessionRuntime?: CliSessionRuntime }).sessionRuntime;
        await runtime?.sendMessage(
          {
            customType: 'kanban-status',
            content: 'Retrospective queued',
            display: true,
            details: { source: 'kanban' },
          },
          { triggerTurn: false, deliverAs: 'followUp' },
        );
        return {
          content: [{ type: 'text', text: 'done' }],
          details: null,
        };
      },
    }));

    const tool = createSeroCliTool(registry, 'ws-1', 'session-1');
    await tool.execute(
      'tool-1',
      { command: 'kanban retrospective' },
      undefined,
      undefined,
      { cwd: '/tmp/ws-1' } as never,
    );

    expect(sendCustomMessage).toHaveBeenCalledWith(
      {
        customType: 'kanban-status',
        content: 'Retrospective queued',
        display: true,
        details: { source: 'kanban' },
      },
      { triggerTurn: false, deliverAs: 'followUp' },
    );
  });
});
