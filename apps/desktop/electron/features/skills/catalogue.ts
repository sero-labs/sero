/**
 * The skill catalogue behind the Admin Skills page: every skill a chat could
 * load, and where each one comes from.
 *
 * - `user`: the profile's `skills` folder.
 * - `plugin`: skills that a plugin or an Agent Plugin brings.
 * - `project`: a workspace's own `.agents/skills`.
 *
 * Project skills are read from disk here, one folder per workspace, so the page
 * can show every project at once. A chat only ever loads its own project's skills.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadSkillsFromDir, type Skill, type SourceInfo } from '@earendil-works/pi-coding-agent';

import type { SkillCatalogue, SkillCatalogueEntry, SkillCatalogueProject } from '@/types/skills';

export interface CatalogueWorkspace {
  id: string;
  name: string;
  path: string;
}

/** The folder Pi reads a project's own skills from. */
export function projectSkillsDir(workspacePath: string): string {
  return path.join(workspacePath, '.agents', 'skills');
}

/** `sero-memory-plugin` becomes `memory`; an Agent Plugin keeps its id. */
export function pluginLabel(sourceInfo: SourceInfo): string {
  if (sourceInfo.source.startsWith('agent-plugin:')) {
    return sourceInfo.source.slice('agent-plugin:'.length);
  }
  // A package's skills sit in its own `skills` folder, and the package is the one above it.
  const base = sourceInfo.baseDir ?? path.dirname(path.dirname(sourceInfo.path));
  const folder = path.basename(base) === 'skills' ? path.basename(path.dirname(base)) : path.basename(base);
  return folder.replace(/^sero-/, '').replace(/-plugin$/, '') || folder;
}

function entryOf(skill: Skill, scope: SkillCatalogueEntry['scope'], origin: string): SkillCatalogueEntry {
  return {
    name: skill.name,
    description: skill.description,
    filePath: skill.filePath,
    scope,
    origin,
    disableModelInvocation: skill.disableModelInvocation,
  };
}

/**
 * `available` is what Sero's resource loader finds outside any project: the
 * profile's skills and the plugin skills. Its own project-scope skills are not
 * a workspace's, so they are left out.
 */
export function buildSkillCatalogue(available: readonly Skill[], workspaces: readonly CatalogueWorkspace[]): SkillCatalogue {
  const skills: SkillCatalogueEntry[] = [];
  for (const skill of available) {
    const { scope } = skill.sourceInfo;
    if (scope === 'user') skills.push(entryOf(skill, 'user', 'user'));
    else if (scope !== 'project') skills.push(entryOf(skill, 'plugin', pluginLabel(skill.sourceInfo)));
  }

  const projects: SkillCatalogueProject[] = [];
  for (const workspace of workspaces) {
    const dir = projectSkillsDir(workspace.path);
    if (!existsSync(dir)) continue;
    const found = loadSkillsFromDir({ dir, source: 'project' }).skills;
    if (found.length === 0) continue;
    projects.push({ id: workspace.id, name: workspace.name });
    for (const skill of found) skills.push(entryOf(skill, 'project', workspace.id));
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills, projects };
}
