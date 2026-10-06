import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistentSessionGrantProposal } from '@sero-ai/common';
import { Type } from 'typebox';
import { createManifest } from '../../manager.fixtures';
import { createPersistentSessionsApi } from '@electron/features/apps/runtime/capabilities/persistent-sessions/index';
import { bridgeExtensionTools, createPrivateCliRegistry } from '@electron/cli';
import { createMemberResourceLoader } from '@electron/features/apps/runtime/capabilities/persistent-sessions/resource-profile';
import { createMemberRuntimeTools } from '@electron/features/apps/runtime/capabilities/persistent-sessions/member-runtime-tools';

const fakes = vi.hoisted(() => ({
  backend: 'host' as string,
  choices: [] as { body: string }[],
  catalogFor: vi.fn(() => [
    { name: 'read' },
    { name: 'bash' },
    { name: 'gh' },
    { name: 'git_manager' },
    { name: 'sero-cli' },
  ]),
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
    getPath: (id: string) => (id === 'ws-1' ? '/Users/me/project' : undefined),
  },
}));

vi.mock('@electron/features/subagent/runtime/tool-catalog', () => ({
  warmSubagentToolCatalog: async () => undefined,
  getToolCatalogFor: fakes.catalogFor,
  getToolPackagePath: () => undefined,
}));

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: { getRuntime: async () => ({ backend: fakes.backend, workspaceId: 'ws-1' }) },
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
import type { StoredDelegationPolicy } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';

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

describe('linked grants under a delegation policy', () => {
  const stored = (overrides: Partial<StoredDelegationPolicy> = {}): StoredDelegationPolicy => ({
    policyId: 'policy-1',
    appId: 'architect',
    owner: 'architect',
    scope: 'proj-1',
    workspaceId: 'ws-1',
    delegateAppIds: ['orchestrator'],
    roles: { builder: skillBearingProposal().subjects.implementer },
    maxLiveSessions: 2,
    maxTotalSessions: 4,
    approvalId: 'approval-1',
    status: 'active',
    issuedAt: '2026-08-14T00:00:00.000Z',
    createdSessions: 0,
    ...overrides,
  });

  beforeEach(() => { fakes.choices = []; });

  it('records a contained Room grant without asking again', async () => {
    const decision = await clampAndApprove('ws-1', skillBearingProposal(), { policy: stored(), callerAppId: 'orchestrator' });

    expect(fakes.choices).toHaveLength(0);
    expect(decision).toMatchObject({ approvalId: 'approval-1', delegatedByPolicyId: 'policy-1' });
  });

  it('asks the user when the Room wants a tool the policy does not hold', async () => {
    const wider = skillBearingProposal();
    wider.subjects.implementer.allowedTools = ['read', 'bash'];
    const decision = await clampAndApprove('ws-1', wider, { policy: stored(), callerAppId: 'orchestrator' });

    expect(fakes.choices).toHaveLength(1);
    expect(decision?.delegatedByPolicyId).toBeUndefined();
  });

  it('keeps today\'s dialog for a Room that names no policy', async () => {
    const decision = await clampAndApprove('ws-1', skillBearingProposal());

    expect(fakes.choices).toHaveLength(1);
    expect(decision?.delegatedByPolicyId).toBeUndefined();
  });
});

describe('persistent session wiring', () => {
  beforeEach(() => {
    fakes.choices = [];
    fakes.backend = 'host';
  });

  it('logs an approved tool that no loaded plugin provides, by name', async () => {
    vi.mocked(createPrivateCliRegistry).mockReturnValue({ list: () => [] } as never);
    vi.mocked(bridgeExtensionTools).mockReturnValue({ extensions: [], errors: [] } as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await installPersistentSessions({
      manifest: createManifest('orchestrator'), workspace: { id: 'global', path: '/global' }, stateFilePath: '/state.json',
    });
    const wiring = vi.mocked(createPersistentSessionsApi).mock.calls.at(-1)?.[0];
    if (!wiring) throw new Error('Session capability was not installed');
    const policy = skillBearingProposal().subjects.implementer;
    policy.allowedTools = ['read', 'web_search', 'sero-cli'];
    policy.permissionProfile = { filesystem: 'read', commands: 'none', network: 'fetch', vcs: 'read' };
    await wiring.buildSessionInputs({
      grantId: 'grant-1', subject: 'investigator', workspaceId: 'ws-1', cwd: '/workspace',
      tools: policy.allowedTools, skills: [], systemPromptAdditions: [], policy,
    });

    // The loaded plugins give the member no `web_search`, as when its plugin was removed.
    const { bridgeExtensions } = vi.mocked(createMemberResourceLoader).mock.calls.at(-1)![0];
    bridgeExtensions?.({ extensions: [], errors: [], runtime: {} } as never);

    expect(warn.mock.calls.flat().join('\n')).toMatch(/investigator approved tools not provided: .*web_search/);
    warn.mockRestore();
  });

  it('gives a container member the runtime path of its working folder, not the host path', async () => {
    fakes.backend = 'docker';
    await installPersistentSessions({
      manifest: createManifest('orchestrator'), workspace: { id: 'global', path: '/global' }, stateFilePath: '/state.json',
    });
    const wiring = vi.mocked(createPersistentSessionsApi).mock.calls.at(-1)?.[0];
    if (!wiring) throw new Error('Session capability was not installed');
    const policy = skillBearingProposal().subjects.implementer;
    await wiring.buildSessionInputs({
      grantId: 'grant-1', subject: 'investigator', workspaceId: 'ws-1', cwd: '/Users/me/project/packages/app',
      tools: ['read'], skills: [], systemPromptAdditions: [], policy,
    });
    expect(vi.mocked(createMemberRuntimeTools).mock.calls.at(-1)?.[2]).toBe('/workspace/packages/app');
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
    expect(createMemberRuntimeTools).toHaveBeenLastCalledWith('ws-1', allowed, '/workspace', 'grant-1:investigator', allowed);
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

  it('offers a member only the tools in the member catalogue', async () => {
    const proposal = skillBearingProposal();
    proposal.subjects.implementer.allowedTools = ['read', 'goal', 'rooms', 'goal_complete'];

    const decision = await clampAndApprove('ws-1', proposal);

    expect(fakes.catalogFor).toHaveBeenCalledWith('member');
    expect(decision?.approved.subjects.implementer.allowedTools).toEqual(['read']);
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

describe('authorized tools versus the initial loadout', () => {
  const runtimeTool = (name: string) => ({
    name, label: name, description: name, parameters: Type.Object({}),
    execute: async () => ({ content: [], details: undefined }),
  });

  async function build(policyTools: string[], requestTools: string[], over: { maxBytes?: number; provided?: string[] } = {}) {
    vi.mocked(createPrivateCliRegistry).mockReturnValue({ list: () => [] } as never);
    vi.mocked(bridgeExtensionTools).mockImplementation(((base: unknown) => base) as never);
    vi.mocked(createMemberRuntimeTools).mockResolvedValueOnce(
      policyTools.filter((name) => ['read', 'bash'].includes(name)).map(runtimeTool),
    );
    await installPersistentSessions({
      manifest: createManifest('orchestrator'), workspace: { id: 'global', path: '/global' }, stateFilePath: '/state.json',
    });
    const wiring = vi.mocked(createPersistentSessionsApi).mock.calls.at(-1)?.[0];
    if (!wiring) throw new Error('Session capability was not installed');
    const policy = skillBearingProposal().subjects.implementer;
    policy.allowedTools = policyTools;
    policy.permissionProfile = { filesystem: 'read', commands: 'all', network: 'fetch', vcs: 'read' };
    policy.maxSystemPromptAdditionBytes = over.maxBytes ?? 1_000;
    // Run the loader's hooks the way Pi does while it loads, so the session sees what they decide.
    let late: string[] = [];
    vi.mocked(createMemberResourceLoader).mockImplementationOnce((async (options: Parameters<typeof createMemberResourceLoader>[0]) => {
      const tools = new Map((over.provided ?? []).map((name) => [name, { definition: runtimeTool(name), sourceInfo: {} }]));
      options.bridgeExtensions({ extensions: [{ resolvedPath: '/p/extension.ts', tools, commands: new Map() }], errors: [], runtime: {} } as never);
      late = options.lateAppendSystemPrompt?.() ?? [];
      return { loaderOptions: options, tools };
    }) as never);
    const inputs = await wiring.buildSessionInputs({
      grantId: 'grant-1', subject: 'investigator', workspaceId: 'ws-1', cwd: '/workspace',
      tools: requestTools, skills: [], systemPromptAdditions: [], policy,
    });
    const loader = inputs.resourceLoader as unknown as { loaderOptions: { extensionFactories: unknown[] }; tools: Map<string, { definition: { exposure?: string } }> };
    return { inputs, late, loader };
  }

  it('registers every approved tool and defers the ones the request did not load', async () => {
    const { inputs, loader } = await build(['read', 'bash', 'web_search', 'sero-cli'], ['read'], { provided: ['web_search'] });

    expect(inputs.tools).toEqual(['read', 'bash', 'web_search', 'sero-cli', 'tool_search']);
    // Only the loadout and the finder are declared when the session opens.
    expect(inputs.initialTools).toEqual(['read', 'sero-cli', 'tool_search']);
    const exposure = Object.fromEntries((inputs.customTools ?? []).filter(Boolean).map((tool) => [tool.name, tool.exposure]));
    expect(exposure).toEqual({ read: undefined, bash: 'deferred' });
    expect(loader.tools.get('web_search')?.definition.exposure).toBe('deferred');
    // The extension is loaded beside the Sero factory; the tool list is what switches it on.
    expect(loader.loaderOptions.extensionFactories).toHaveLength(2);
  });

  it('adds no tool_search when nothing is deferred', async () => {
    const { inputs, loader } = await build(['read', 'bash', 'sero-cli'], ['read', 'bash']);

    expect(inputs.tools).toEqual(['read', 'bash', 'sero-cli']);
    expect(inputs.initialTools).toBeUndefined();
    expect(loader.loaderOptions.extensionFactories).toHaveLength(1);
  });

  it('names a tool the profile removed, one this kind of session cannot have and one with no plugin', async () => {
    const { inputs, late } = await build(['read', 'write', 'codemode', 'web_search', 'sero-cli'], ['read']);

    expect(inputs.tools).not.toContain('write');
    expect(late).toHaveLength(1);
    expect(late[0]).toContain('write (outside the approval)');
    expect(late[0]).toContain('codemode (not available to this kind of session)');
    expect(late[0]).toContain('web_search (its plugin is not installed)');
  });

  it('skips the note instead of failing the open when it does not fit the addition cap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { inputs, late } = await build(['read', 'web_search', 'sero-cli'], ['read'], { maxBytes: 10 });

    expect(late).toEqual([]);
    expect(inputs.tools).toContain('read');
    expect(warn.mock.calls.flat().join('\n')).toContain('web_search');
    warn.mockRestore();
  });

  it('computes the set per subject policy, so one project never sees another project\'s tools', async () => {
    const first = await build(['read', 'sero-cli'], ['read']);
    const second = await build(['read', 'bash', 'sero-cli'], ['read']);

    expect(first.inputs.tools).not.toContain('bash');
    expect(second.inputs.tools).toContain('bash');
    expect(first.inputs.tools).not.toContain('tool_search');
  });

  it('reopens with the same registered set, and names a tool whose plugin went away in between', async () => {
    const before = await build(['read', 'web_search', 'sero-cli'], ['read'], { provided: ['web_search'] });
    const after = await build(['read', 'web_search', 'sero-cli'], ['read'], { provided: ['web_search'] });
    const gone = await build(['read', 'web_search', 'sero-cli'], ['read']);

    expect(after.inputs.tools).toEqual(before.inputs.tools);
    expect(after.late).toEqual([]);
    expect(gone.late[0]).toContain('web_search (its plugin is not installed)');
  });
});
