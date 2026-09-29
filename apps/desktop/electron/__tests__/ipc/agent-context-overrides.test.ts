import { describe, expect, it, vi } from 'vitest';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

import { applyContextOverrides } from '@electron/ipc/agent/core/agent-context-overrides';

vi.mock('@electron/ipc/agent/core/agent-helpers', () => ({
  getBaseSystemPrompt: () => 'BASE',
  rewriteSessionManagerFile: () => {},
  setBaseSystemPrompt: () => {},
  stripDisabledSkills: (prompt: string) => prompt,
}));

describe('applyContextOverrides', () => {
  it('keeps a tool an extension switched on after start-up, and applies what the user disabled', () => {
    let active = ['read', 'bash', 'goal_complete'];
    const session = {
      getActiveToolNames: () => active,
      setActiveToolsByName: (names: string[]) => { active = names; },
    } as Pick<AgentSession, 'getActiveToolNames' | 'setActiveToolsByName'> as AgentSession;

    applyContextOverrides(
      {
        session,
        baseSystemPrompt: 'BASE',
        baseTools: [{ name: 'read' }, { name: 'bash' }],
        contextOverrides: null,
      },
      { disabledTools: ['bash'] },
    );

    expect(active).toEqual(['read', 'goal_complete']);
  });
});
