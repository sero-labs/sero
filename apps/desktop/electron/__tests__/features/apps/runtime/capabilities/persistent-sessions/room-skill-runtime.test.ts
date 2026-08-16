import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import {
  SERO_PLUGIN_RUNTIME_ABI,
  withDisabledModelSkills,
  type PersistentSessionGrantProposal,
} from '@sero-ai/common';

import { clampProposal } from '@electron/features/apps/runtime/capabilities/persistent-sessions/clamp';

async function writeSkill(root: string, name: string, locked = false): Promise<string> {
  const directory = path.join(root, name);
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, 'SKILL.md');
  await fs.writeFile(filePath, [
    '---',
    `name: ${name}`,
    `description: ${name} test skill.`,
    ...(locked ? ['disable-model-invocation: true'] : []),
    '---',
    '',
    `# ${name}`,
  ].join('\n'));
  return filePath;
}

async function writePluginPackage(
  agentDir: string,
  pluginId: string,
  skillNames: Array<{ name: string; locked?: boolean }>,
  minSeroVersion?: string,
): Promise<Array<{ name: string; filePath: string; valid: true }>> {
  const pluginRoot = path.join(agentDir, 'agent-plugins', pluginId);
  await fs.mkdir(pluginRoot, { recursive: true });
  await fs.writeFile(path.join(pluginRoot, 'package.json'), JSON.stringify({
    name: pluginId,
    version: '1.0.0',
    sero: {
      plugin: {
        category: 'utilities',
        tags: ['test'],
        runtimeAbi: SERO_PLUGIN_RUNTIME_ABI,
        ...(minSeroVersion ? { minSeroVersion } : {}),
      },
    },
  }));

  return Promise.all(skillNames.map(async ({ name, locked }) => ({
    name,
    filePath: await writeSkill(path.join(pluginRoot, 'skills'), name, locked),
    valid: true as const,
  })));
}

function proposal(cwd: string, skillNames: string[]): PersistentSessionGrantProposal {
  return {
    owner: 'orchestrator',
    scope: 'room-skill-test',
    workspaceId: 'ws-1',
    subjects: {
      implementer: {
        allowedCwds: [cwd],
        allowedModels: [],
        allowedTools: [],
        allowedSkills: skillNames,
        allowedThinkingLevels: [],
        permissionProfile: { filesystem: 'read', commands: 'none', network: 'none', vcs: 'none' },
        maxSystemPromptAdditionBytes: 0,
      },
    },
    maxLiveSessions: 1,
    maxTotalSessions: 1,
    reason: 'Test the Room skill surface.',
  };
}

describe('Room skill catalogue and member loading', () => {
  let tempRoot: string | null = null;

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('@electron/platform/env');
    vi.doUnmock('@electron/features/subagent/runtime/loader');
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it('keeps the generic loader and catalogue aligned, then narrows Room skills fail-closed', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-room-skills-'));
    const cwd = path.join(tempRoot, 'workspace');
    const agentDir = path.join(tempRoot, 'agent');
    await fs.mkdir(cwd, { recursive: true });

    await writeSkill(path.join(agentDir, 'skills'), 'normal-enabled');
    await writeSkill(path.join(agentDir, 'skills'), 'normal-disabled');
    await writeSkill(path.join(agentDir, 'skills'), 'frontmatter-locked', true);
    const compatibleSkills = await writePluginPackage(agentDir, 'compatible-plugin', [
      { name: 'plugin-enabled' },
      { name: 'plugin-disabled' },
    ]);
    const incompatibleSkills = await writePluginPackage(
      agentDir,
      'incompatible-plugin',
      [{ name: 'plugin-incompatible' }],
      '9.9.9',
    );
    await fs.writeFile(path.join(agentDir, 'agent-plugins.json'), JSON.stringify({
      version: 1,
      plugins: [
        {
          id: 'compatible-plugin',
          enabled: true,
          manifest: { name: 'compatible-plugin' },
          skills: compatibleSkills,
        },
        {
          id: 'incompatible-plugin',
          enabled: true,
          manifest: { name: 'incompatible-plugin' },
          skills: incompatibleSkills,
        },
      ],
    }));

    vi.doMock('@electron/platform/env', () => ({
      SERO_HOME: tempRoot,
      SERO_AGENT_DIR: agentDir,
      SERO_FIXED_ROOT: tempRoot,
      SERO_HOST_ARTIFACTS_ROOT: tempRoot,
    }));
    vi.doMock('@electron/features/subagent/runtime/loader', () => ({
      createSubagentExtensionFactory: vi.fn(() => vi.fn()),
    }));
    const [
      { createRoomSkillOverride },
      { createMemberResourceLoader },
      { createSubagentResourceLoader },
      { createSubagentSkillOverride },
    ] = await Promise.all([
      import('@electron/features/apps/extensions/room-skills'),
      import('@electron/features/apps/runtime/capabilities/persistent-sessions/resource-profile'),
      import('@electron/features/subagent/runtime/resource-loader'),
      import('@electron/features/subagent/runtime/skill-pipeline'),
    ]);
    const settingsManager = SettingsManager.inMemory(withDisabledModelSkills({}, [
      'normal-disabled',
      'plugin-disabled',
    ]));
    const genericLoader = createSubagentResourceLoader({
      cwd,
      workspaceManager: {} as never,
      workspaceId: 'ws-1',
      sessionId: 'session-1',
      settingsManager,
    });
    await genericLoader.reload();
    const genericSkills = genericLoader.getSkills().skills;
    const genericByName = new Map(genericSkills.map((skill) => [skill.name, skill]));

    expect(genericByName.get('plugin-enabled')?.disableModelInvocation).toBe(false);
    expect(genericByName.get('plugin-disabled')?.disableModelInvocation).toBe(true);
    expect(genericByName.has('plugin-incompatible')).toBe(false);

    const catalogueLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      skillsOverride: createSubagentSkillOverride(settingsManager),
    });
    await catalogueLoader.reload();
    const catalogueSkills = catalogueLoader.getSkills().skills;
    expect(catalogueSkills.map(({ name, disableModelInvocation }) => ({
      name,
      disableModelInvocation,
    }))).toEqual(genericSkills.map(({ name, disableModelInvocation }) => ({
      name,
      disableModelInvocation,
    })));

    const roomCatalogueLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      skillsOverride: createRoomSkillOverride(settingsManager),
    });
    await roomCatalogueLoader.reload();
    const offered = roomCatalogueLoader.getSkills().skills.map((skill) => skill.name).sort();

    expect(offered).toEqual(expect.arrayContaining(['normal-enabled', 'plugin-enabled']));
    expect(offered).not.toEqual(expect.arrayContaining([
      'normal-disabled',
      'plugin-disabled',
      'plugin-incompatible',
      'frontmatter-locked',
    ]));

    const requested = ['plugin-enabled', 'normal-disabled', 'plugin-disabled', 'frontmatter-locked'];
    const approved = clampProposal(proposal(cwd, requested), {
      workspaceRoots: [cwd],
      availableModels: new Set(),
      availableTools: new Set(),
      availableSkills: new Set(offered),
      permissionCeiling: { filesystem: 'read', commands: 'none', network: 'none', vcs: 'none' },
    }).proposal.subjects.implementer.allowedSkills;
    expect(approved).toEqual(['plugin-enabled']);

    const memberLoader = await createMemberResourceLoader({
      cwd,
      allowedSkills: approved,
      appendSystemPrompt: [],
      settingsManager,
      packages: [],
      extensionFactories: [],
      bridgeExtensions: (base) => base,
    });
    expect(memberLoader.getSkills().skills.map((skill) => skill.name)).toEqual(['plugin-enabled']);
  });
});
