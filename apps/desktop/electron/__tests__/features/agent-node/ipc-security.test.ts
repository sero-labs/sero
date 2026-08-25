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

  it('preserves only the masked API-key provider catalogue shape', () => {
    expect(protectAgentNodeReply({ apiKey: [
      { id: 'anthropic', name: 'Anthropic', hasKey: true, fromEnv: false },
    ] })).toEqual({ apiKey: [
      { id: 'anthropic', name: 'Anthropic', hasKey: true, fromEnv: false },
    ] });
    expect(protectAgentNodeReply({ apiKey: ['secret'] })).toEqual({});
  });
});
