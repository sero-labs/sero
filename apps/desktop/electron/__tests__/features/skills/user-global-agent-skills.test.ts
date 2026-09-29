import os from 'node:os';
import path from 'node:path';

import { createSyntheticSourceInfo, type Skill } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

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
});
