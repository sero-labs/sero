import { describe, expect, it, vi } from 'vitest';
import { SESSION_CLI_SURFACE_EVENT } from '@sero-ai/common';
import { CliRegistry } from '@electron/cli/core';
import { announceSessionCliSurface } from '../../cli/session-surface';

const execute = async () => ({ output: 'ok', exitCode: 0 });

describe('announceSessionCliSurface', () => {
  it('emits only the commands the session can run', () => {
    const registry = new CliRegistry();
    registry.register({ name: 'workspace', summary: 'Manage workspaces', group: 'Builtin', source: 'builtin', execute });
    // A command bridged for a chat, not for the subagent being announced.
    registry.replaceAppCommandsForSession('chat-1', [{
      name: 'mcp',
      summary: 'MCP servers',
      group: 'Apps',
      source: 'app',
      owner: { kind: 'session-extension', sessionId: 'chat-1', extensionPath: '/plugin' },
      execute,
    }]);
    // A command bridged for this subagent, the way a default subagent is.
    registry.replaceAppCommandsForSession('subagent-1', [{
      name: 'graphify_query',
      summary: 'Query the knowledge graph',
      group: 'Apps',
      source: 'app',
      owner: { kind: 'session-extension', sessionId: 'subagent-1', extensionPath: '/plugin' },
      execute,
    }]);

    const emit = vi.fn();
    announceSessionCliSurface({ emit, on: () => () => {} }, 'ws', 'subagent-1', registry);

    expect(emit).toHaveBeenCalledWith(SESSION_CLI_SURFACE_EVENT, {
      commands: ['graphify_query', 'workspace'],
    });
  });

  it('drops hidden commands', () => {
    const registry = new CliRegistry();
    registry.register({ name: 'secret', summary: 'Hidden', group: 'Builtin', source: 'builtin', hidden: true, execute });

    const emit = vi.fn();
    announceSessionCliSurface({ emit, on: () => () => {} }, 'ws', 'chat-1', registry);

    expect(emit).toHaveBeenCalledWith(SESSION_CLI_SURFACE_EVENT, { commands: [] });
  });
});
