import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createSyntheticSourceInfo, type Skill } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { dropUserGlobalAgentSkills } from '@electron/features/skills/user-global-agent-skills';

function skillAt(name: string, filePath: string): Skill {
  return {
    name,
    description: name,
    filePath,
    baseDir: path.dirname(filePath),
    sourceInfo: createSyntheticSourceInfo(filePath, { source: 'test' }),
    disableModelInvocation: false,
  };
}

describe('dropUserGlobalAgentSkills', () => {
  it('drops user-global agent skills and keeps project agent skills', () => {
    const userGlobal = skillAt('global', path.join(os.homedir(), '.agents', 'skills', 'global', 'SKILL.md'));
    const project = skillAt('project', path.join('/work/repo', '.agents', 'skills', 'project', 'SKILL.md'));
    const profile = skillAt('profile', path.join(os.homedir(), '.sero-ui', 'agent', 'skills', 'profile', 'SKILL.md'));

    const result = dropUserGlobalAgentSkills({ skills: [userGlobal, project, profile], diagnostics: [] });

    expect(result.skills.map((skill) => skill.name)).toEqual(['project', 'profile']);
  });

  afterEach(() => vi.restoreAllMocks());

  it('drops a skill that a project link leads into the user-global folder', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'user-global-skills-'));
    const home = path.join(root, 'home');
    fs.mkdirSync(path.join(home, '.agents', 'skills', 'other-tool'), { recursive: true });
    fs.writeFileSync(path.join(home, '.agents', 'skills', 'other-tool', 'SKILL.md'), '# other');
    fs.mkdirSync(path.join(root, 'repo', '.agents'), { recursive: true });
    fs.symlinkSync(path.join(home, '.agents', 'skills'), path.join(root, 'repo', '.agents', 'skills'));
    vi.spyOn(os, 'homedir').mockReturnValue(home);

    const linked = skillAt('other-tool', path.join(root, 'repo', '.agents', 'skills', 'other-tool', 'SKILL.md'));
    const result = dropUserGlobalAgentSkills({ skills: [linked], diagnostics: [] });

    expect(result.skills).toEqual([]);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
