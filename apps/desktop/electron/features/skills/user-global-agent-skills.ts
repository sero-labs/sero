import os from 'node:os';
import path from 'node:path';

import type { ResourceDiagnostic, Skill } from '@earendil-works/pi-coding-agent';

/**
 * Pi always adds `~/.agents/skills`. Another tool's skill installer owns that
 * folder, so Sero does not load it. Project `.agents/skills` folders still load.
 */
export function dropUserGlobalAgentSkills<T extends { skills: Skill[]; diagnostics: ResourceDiagnostic[] }>(
  base: T,
): T {
  const userGlobal = path.join(os.homedir(), '.agents', 'skills') + path.sep;
  return {
    ...base,
    skills: base.skills.filter((skill) => !path.resolve(skill.filePath).startsWith(userGlobal)),
  };
}
