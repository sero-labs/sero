import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { withDisabledModelSkills, type PersistentSessionGrantProposal } from '@sero-ai/common';

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
    if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it('offers, approves, and loads only compatible model-visible skills', async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-room-skills-'));
    const cwd = path.join(tempRoot, 'workspace');
    const agentDir = path.join(tempRoot, 'agent');
    await fs.mkdir(cwd, { recursive: true });

    await writeSkill(path.join(agentDir, 'skills'), 'normal-enabled');
    await writeSkill(path.join(agentDir, 'skills'), 'normal-disabled');
    await writeSkill(path.join(agentDir, 'skills'), 'frontmatter-locked', true);
    const pluginSkillRoot = path.join(agentDir, 'agent-plugins', 'test-plugin', 'skills');
    const enabledPluginPath = await writeSkill(pluginSkillRoot, 'plugin-enabled');
    const disabledPluginPath = await writeSkill(pluginSkillRoot, 'plugin-disabled');
    await fs.writeFile(path.join(agentDir, 'agent-plugins.json'), JSON.stringify({
      version: 1,
      plugins: [{
        id: 'test-plugin',
        enabled: true,
        manifest: { name: 'test-plugin' },
        skills: [
          { name: 'plugin-enabled', filePath: enabledPluginPath, valid: true },
          { name: 'plugin-disabled', filePath: disabledPluginPath, valid: true },
        ],
      }],
    }));

    vi.doMock('@electron/platform/env', () => ({
      SERO_HOME: tempRoot,
      SERO_AGENT_DIR: agentDir,
      SERO_FIXED_ROOT: tempRoot,
      SERO_HOST_ARTIFACTS_ROOT: tempRoot,
    }));
    const [{ createRoomSkillOverride }, { createMemberResourceLoader }] = await Promise.all([
      import('@electron/features/apps/extensions/room-skills'),
      import('@electron/features/apps/runtime/capabilities/persistent-sessions/resource-profile'),
    ]);
    const settingsManager = SettingsManager.inMemory(withDisabledModelSkills({}, [
      'normal-disabled',
      'plugin-disabled',
    ]));
    const catalogueLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      skillsOverride: createRoomSkillOverride(settingsManager),
    });
    await catalogueLoader.reload();
    const offered = catalogueLoader.getSkills().skills.map((skill) => skill.name).sort();

    expect(offered).toEqual(expect.arrayContaining(['normal-enabled', 'plugin-enabled']));
    expect(offered).not.toEqual(expect.arrayContaining([
      'normal-disabled',
      'plugin-disabled',
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
