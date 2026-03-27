import { describe, expect, it, vi } from 'vitest';

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

describe('workflow actions', () => {
  it('queues the brainstorm prompt template as a follow-up', async () => {
    const { handleBrainstorm } = await import('../workflow-actions');
    const sendUserMessage = vi.fn();
    const pi = { sendUserMessage } as unknown as ExtensionAPI;

    const result = handleBrainstorm(pi);

    expect(sendUserMessage).toHaveBeenCalledWith('/brainstorm', { deliverAs: 'followUp' });
    expect(result.content[0]?.text).toBe('Queued the /brainstorm workflow in the chat session.');
  });
});
