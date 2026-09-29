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

  it('does not bring back a tool an extension switched off, but undoes what an earlier override disabled', () => {
    // goal_complete was on when the chat opened, so it is a base tool. The goal has ended since.
    let active = ['read'];
    const session = {
      getActiveToolNames: () => active,
      setActiveToolsByName: (names: string[]) => { active = names; },
    } as Pick<AgentSession, 'getActiveToolNames' | 'setActiveToolsByName'> as AgentSession;
    const entry = {
      session,
      baseSystemPrompt: 'BASE',
      baseTools: [{ name: 'read' }, { name: 'bash' }, { name: 'goal_complete' }],
      contextOverrides: { disabledTools: ['bash'] },
    };

    // The user changes an unrelated setting: goal_complete stays off, and bash is still disabled.
    applyContextOverrides(entry, { disabledTools: ['bash'], disabledSkills: ['x'] });
    expect(active).toEqual(['read']);

    // The user turns bash back on: it returns.
    applyContextOverrides(entry, { disabledSkills: ['x'] });
    expect(active).toEqual(['read', 'bash']);
  });
});
