import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistentSessionGrantProposal } from '@sero-ai/common';

const fakes = vi.hoisted(() => ({
  choices: [] as { body: string }[],
}));

vi.mock('@electron/shared/infra/ai-infra', () => ({
  ensureAiInfra: async () => ({
    modelRuntime: {
      getAvailable: async () => [{ provider: 'anthropic', id: 'sonnet' }],
    },
  }),
}));

vi.mock('@electron/platform/desktop/request-choice', () => ({
  requestChoice: async (input: { body: string }) => {
    fakes.choices.push(input);
    return { choiceId: 'allow', timedOut: false };
  },
}));

vi.mock('@electron/features/workspace/manager', () => ({
  workspaceManager: { list: async () => [{ id: 'ws-1', path: '/workspace' }] },
}));

vi.mock('@electron/features/subagent/runtime/tool-catalog', () => ({
  warmSubagentToolCatalog: async () => undefined,
  getSubagentToolCatalog: () => [{ name: 'read' }],
}));

vi.mock('@electron/ipc/agent/handlers/subagent-context', () => ({
  getSubagentAvailableContext: async () => ({
    systemPrompt: '',
    tools: [],
    skills: [{ name: 'sero-plugin', description: 'Build a Sero plugin.', filePath: '/skills/sero-plugin/SKILL.md' }],
    agents: [],
    overrides: null,
  }),
}));

vi.mock('@electron/cli', () => ({
  bridgeExtensionTools: vi.fn(),
  createPrivateCliRegistry: vi.fn(),
  createWorkspaceCliTool: vi.fn(),
}));

vi.mock('@electron/features/apps/extensions/create-sero-extension', () => ({
  createSeroExtensionFactory: vi.fn(),
}));

vi.mock('@electron/features/apps/runtime/capabilities/persistent-sessions/resource-profile', () => ({
  createMemberResourceLoader: vi.fn(),
}));

vi.mock('@electron/features/apps/runtime/capabilities/persistent-sessions/index', () => ({
  createPersistentSessionsApi: vi.fn(),
}));

import { clampAndApprove } from '@electron/features/apps/runtime/capabilities/persistent-sessions/wiring';

function skillBearingProposal(): PersistentSessionGrantProposal {
  return {
    owner: 'orchestrator',
    scope: 'room-1',
    workspaceId: 'ws-1',
    subjects: {
      implementer: {
        allowedCwds: ['/workspace'],
        allowedModels: ['anthropic/sonnet'],
        allowedTools: ['read'],
        allowedSkills: ['sero-plugin'],
        allowedThinkingLevels: ['high'],
        permissionProfile: { filesystem: 'read', commands: 'readOnly', network: 'none', vcs: 'read' },
        maxSystemPromptAdditionBytes: 1_000,
      },
    },
    maxLiveSessions: 1,
    maxTotalSessions: 1,
    reason: 'Start a skill-bearing Room member.',
  };
}

describe('persistent session wiring', () => {
  beforeEach(() => {
    fakes.choices = [];
  });

  it('keeps a Room skill that the canonical workspace catalogue can resolve', async () => {
    const decision = await clampAndApprove('ws-1', skillBearingProposal());

    expect(decision?.approved.subjects.implementer.allowedSkills).toEqual(['sero-plugin']);
    expect(fakes.choices).toHaveLength(1);
  });
});
