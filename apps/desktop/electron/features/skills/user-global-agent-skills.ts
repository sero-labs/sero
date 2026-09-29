import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ResourceDiagnostic, Skill } from '@earendil-works/pi-coding-agent';

function realpathOrSelf(target: string): string {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

/**
 * Pi always adds `~/.agents/skills`. Another tool's skill installer owns that
 * folder, so Sero does not load it. Project `.agents/skills` folders still load.
 *
 * A skill counts as user-global when its path, or where its path really leads,
 * is inside that folder. Pi keeps the linked path of a skill folder that is a
 * symlink, so a project link to `~/.agents/skills` must not get past the check.
 */
export function dropUserGlobalAgentSkills<T extends { skills: Skill[]; diagnostics: ResourceDiagnostic[] }>(
  base: T,
): T {
  const folder = path.join(os.homedir(), '.agents', 'skills');
  const folders = [folder, realpathOrSelf(folder)].map((candidate) => candidate + path.sep);
  const isUserGlobal = (file: string): boolean => (
    [path.resolve(file), realpathOrSelf(file)].some((candidate) => folders.some((prefix) => candidate.startsWith(prefix)))
  );
  return {
    ...base,
    skills: base.skills.filter((skill) => !isUserGlobal(skill.filePath)),
  };
}
