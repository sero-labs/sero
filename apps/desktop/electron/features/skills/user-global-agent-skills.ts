import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ResourceDiagnostic, Skill } from '@earendil-works/pi-coding-agent';

function isSymlink(target: string): boolean {
  try {
    return fs.lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

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
 * A skill is user-global when it is loaded through that folder's path. When the
 * folder is a real one, it is also user-global when its path only leads there,
 * because Pi keeps the linked path of a skill folder that is a symlink and a
 * project link to `~/.agents/skills` must not get past the check. When the
 * folder is itself a link to another folder, that other folder is loaded on its
 * own terms, so only the path through the link counts.
 */
export function dropUserGlobalAgentSkills<T extends { skills: Skill[]; diagnostics: ResourceDiagnostic[] }>(
  base: T,
): T {
  const folder = path.join(os.homedir(), '.agents', 'skills');
  const prefix = folder + path.sep;
  const realPrefix = realpathOrSelf(folder) + path.sep;
  const followLinks = !isSymlink(folder);
  const isUserGlobal = (file: string): boolean => (
    path.resolve(file).startsWith(prefix) || (followLinks && realpathOrSelf(file).startsWith(realPrefix))
  );
  return {
    ...base,
    skills: base.skills.filter((skill) => !isUserGlobal(skill.filePath)),
  };
}
