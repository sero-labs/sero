import { describe, it, expect, vi } from 'vitest';
import { Type } from '@sinclair/typebox';

import { bridgeTool } from '../../cli/core/schema-bridge';

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
});
