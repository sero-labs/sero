import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistentSessionGrantProposal } from '@sero-ai/common';
import { Type } from 'typebox';
import { createManifest } from '../../manager.fixtures';
import { createPersistentSessionsApi } from '@electron/features/apps/runtime/capabilities/persistent-sessions/index';
import { createMemberRuntimeTools } from '@electron/features/apps/runtime/capabilities/persistent-sessions/member-runtime-tools';

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
  workspaceManager: {
    list: async () => [
      { id: 'ws-1', path: '/workspace' },
      { id: 'ws-2', path: '/other-workspace' },
    ],
  },
}));

vi.mock('@electron/features/subagent/runtime/tool-catalog', () => ({
  warmSubagentToolCatalog: async () => undefined,
  getSubagentToolCatalog: () => [
    { name: 'read' },
    { name: 'bash' },
    { name: 'gh' },
    { name: 'git_manager' },
    { name: 'sero-cli' },
  ],
}));

vi.mock('@electron/ipc/agent/handlers/subagent-context', () => ({
  getRoomSkillCatalog: async () => [
    { name: 'sero-plugin', description: 'Build a Sero plugin.', filePath: '/skills/sero-plugin/SKILL.md' },
  ],
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

vi.mock('@electron/features/apps/runtime/capabilities/persistent-sessions/member-runtime-tools', () => ({
  createMemberRuntimeTools: vi.fn(async () => []),
}));

import { clampAndApprove, installPersistentSessions } from '@electron/features/apps/runtime/capabilities/persistent-sessions/wiring';

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
        allowedSkills: ['sero-plugin', 'normal-disabled'],
        allowedThinkingLevels: ['high'],
        permissionProfile: { filesystem: 'write', commands: 'all', network: 'none', vcs: 'commit' },
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

  it.each(['none', 'all'] as const)('hands runtime tools to Pi after applying commands: %s', async (commands) => {
    const browser = {
      name: 'automation_browser', label: 'Browser', description: 'Approved browser', parameters: Type.Object({}),
      execute: async () => ({ content: [], details: undefined }),
    };
    const bash = { ...browser, name: 'bash' };
    const runtimeTools = commands === 'all' ? [browser, bash] : [browser];
    vi.mocked(createMemberRuntimeTools).mockResolvedValueOnce(runtimeTools);
    await installPersistentSessions({
      manifest: createManifest('orchestrator'), workspace: { id: 'global', path: '/global' }, stateFilePath: '/state.json',
    });
    const wiring = vi.mocked(createPersistentSessionsApi).mock.calls.at(-1)?.[0];
    if (!wiring) throw new Error('Session capability was not installed');
    const policy = skillBearingProposal().subjects.implementer;
    policy.allowedTools = ['read', 'write', 'automation_browser', 'sero-cli', 'bash'];
    policy.permissionProfile = { filesystem: 'read', commands, network: 'fetch', vcs: 'read' };
    const inputs = await wiring.buildSessionInputs({
      grantId: 'grant-1', subject: 'investigator', workspaceId: 'ws-1', cwd: '/workspace',
      tools: policy.allowedTools, skills: [], systemPromptAdditions: [], policy,
    });
    const allowed = ['read', 'automation_browser', 'sero-cli', ...(commands === 'all' ? ['bash'] : [])];
    expect(createMemberRuntimeTools).toHaveBeenLastCalledWith('ws-1', allowed, '/workspace', 'grant-1:investigator');
    expect(inputs.customTools).toEqual(expect.arrayContaining(runtimeTools));
    expect(inputs.tools).toEqual(allowed);
    expect(inputs.customTools).toContain(browser);
    expect(inputs.tools).not.toContain('write');
  });

  it('keeps a Room skill that the canonical workspace catalogue can resolve', async () => {
    const decision = await clampAndApprove('ws-1', skillBearingProposal());

    expect(decision?.approved.subjects.implementer.allowedSkills).toEqual(['sero-plugin']);
    expect(fakes.choices).toHaveLength(1);
    expect(fakes.choices[0].body).toContain('Read and edit files in this workspace');
    expect(fakes.choices[0].body).toContain('Run commands');
    expect(fakes.choices[0].body).toContain('normal-disabled');
  });

  it('refuses a proposal whose workspace id is not registered, before any prompt', async () => {
    const decision = await clampAndApprove('ws-gone', skillBearingProposal());
    expect(decision).toBeNull();
  });

  it('drops a cwd that sits in another registered workspace', async () => {
    const proposal = skillBearingProposal();
    proposal.subjects.implementer.allowedCwds = ['/workspace/app', '/other-workspace/app'];

    const decision = await clampAndApprove('ws-1', proposal);

    expect(decision?.approved.subjects.implementer.allowedCwds).toEqual(['/workspace/app']);
    expect(fakes.choices[0].body).toContain('/other-workspace/app');
  });

  it('removes tools the approved permission profile cannot provide', async () => {
    const proposal = skillBearingProposal();
    proposal.subjects.implementer.allowedTools = ['read', 'bash', 'gh', 'git_manager', 'sero-cli'];
    proposal.subjects.implementer.permissionProfile = {
      filesystem: 'read',
      commands: 'readOnly',
      network: 'none',
      vcs: 'read',
    };

    const decision = await clampAndApprove('ws-1', proposal);

    expect(decision?.approved.subjects.implementer.allowedTools).toEqual(['read', 'sero-cli']);
    expect(fakes.choices[0].body).toContain('Tools: read, sero-cli');
    expect(fakes.choices[0].body).not.toContain('Run commands');
    expect(fakes.choices[0].body).toContain('Not available under this approval, so removed: bash, gh, git_manager');
  });
});
