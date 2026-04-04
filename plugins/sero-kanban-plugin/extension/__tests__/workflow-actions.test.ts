import { describe, expect, it, vi } from 'vitest';

import type { KanbanSessionRuntime } from '../session-runtime';

describe('workflow actions', () => {
  it('queues the brainstorm prompt template as a follow-up', async () => {
    const { handleBrainstorm } = await import('../workflow-actions');
    const runtime: KanbanSessionRuntime = {
      sendUserMessage: vi.fn(),
      sendMessage: vi.fn(),
    };

    const result = await handleBrainstorm(runtime);

    expect(runtime.sendUserMessage).toHaveBeenCalledWith('/brainstorm', { deliverAs: 'followUp' });
    expect(result.content[0]?.text).toBe('Queued the /brainstorm workflow in the chat session.');
  });
});
