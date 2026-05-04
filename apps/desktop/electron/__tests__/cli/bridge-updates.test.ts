import { describe, it, expect, vi } from 'vitest';
import { Type } from 'typebox';

import { CliRegistry } from '@electron/cli/core/registry';
import { bridgeTool } from '@electron/cli/core/schema-bridge';
import { executeCliBatch } from '@electron/cli/core/tool';

describe('CLI bridge tool updates', () => {
  it('forwards partial tool updates through the bridged CLI command', async () => {
    const onUpdate = vi.fn();

    const command = bridgeTool('fetch_content', {
      name: 'fetch_content',
      label: 'Fetch Content',
      description: 'Fetch URL content',
      parameters: Type.Object({ url: Type.String() }),
      execute: async (_toolCallId, _params, _signal, toolOnUpdate) => {
        toolOnUpdate?.({
          content: [{ type: 'text', text: 'Fetching 1 URL(s)... 5s elapsed.' }],
          details: { phase: 'fetch', elapsedSec: 5 },
        });
        return {
          content: [{ type: 'text', text: 'done' }],
          details: null,
        };
      },
    });

    const result = await command.execute(
      ['https://example.com'],
      {
        workspaceId: 'ws-1',
        cwd: '/tmp/ws-1',
        invocation: { workspaceId: 'ws-1', sessionId: 's-1', turnId: 't-1', source: 'tool' },
        workspaceManager: {} as never,
        containerManager: {} as never,
      },
      onUpdate,
    );

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: 'text', text: 'Fetching 1 URL(s)... 5s elapsed.' }],
      details: { phase: 'fetch', elapsedSec: 5 },
    });
    expect(result.output).toBe('done');
  });

  it('forwards partial updates for multi-line CLI batches', async () => {
    const onUpdate = vi.fn();
    const registry = new CliRegistry();

    registry.register({
      name: 'web_search',
      summary: 'Search the web',
      execute: async (_args, _context, toolOnUpdate) => {
        toolOnUpdate?.({
          content: [{ type: 'text', text: 'Searching 1/2: "valencia"...' }],
          details: { phase: 'search', progress: 0, currentQuery: 'valencia' },
        });
        return { output: 'done', exitCode: 0 };
      },
    });

    await executeCliBatch(
      registry,
      'web_search --query "valencia"\nweb_search --query "events in valencia"',
      {
        workspaceId: 'ws-1',
        cwd: '/tmp/ws-1',
        invocation: { workspaceId: 'ws-1', sessionId: 's-1', turnId: null, source: 'tool' },
        workspaceManager: {} as never,
        containerManager: {} as never,
      },
      undefined,
      onUpdate,
    );

    expect(onUpdate).toHaveBeenCalledWith({
      content: [{ type: 'text', text: 'Searching 1/2: "valencia"...' }],
      details: {
        phase: 'search',
        progress: 0,
        currentQuery: 'valencia',
        commandLine: 'web_search --query "valencia"',
        commandIndex: 1,
        commandCount: 2,
      },
    });
  });
});
