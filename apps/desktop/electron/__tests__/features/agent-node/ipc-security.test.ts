import { describe, expect, it } from 'vitest';
import { protectAgentNodeReply } from '@electron/features/agent-node/ipc-security';

describe('Agent Node IPC security', () => {
  it('never sends bearer or provider credentials to the renderer', () => {
    expect(protectAgentNodeReply({
      token: 'bearer',
      controller: { id: 'controller-1', accessToken: 'oauth', refreshToken: 'refresh' },
      providers: [{ id: 'anthropic', apiKey: 'key', configured: true }],
    })).toEqual({
      controller: { id: 'controller-1' },
      providers: [{ id: 'anthropic', configured: true }],
    });
  });
});
