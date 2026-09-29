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

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  loadSkillsFromDir,
  parseFrontmatter,
  type ResourceDiagnostic,
  type Skill,
  type SkillFrontmatter,
  type SourceInfo,
} from '@earendil-works/pi-coding-agent';

import { resolvesInside, SKILLS_DIR } from '@electron/features/skills/store';
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

/**
 * A project's skills folder, or null when a symlink in `.agents` or `.agents/skills`
 * leads out of the project. The repo may have come from anyone, so that folder is
 * neither listed nor opened.
 */
export function projectSkillsRoot(workspacePath: string): string | null {
  const dir = projectSkillsDir(workspacePath);
  return resolvesInside(dir, workspacePath) ? dir : null;
}

const tidy = (folder: string): string => folder.replace(/^sero-/, '').replace(/-plugin$/, '') || folder;

/** `sero-memory-plugin` becomes `memory`; an Agent Plugin keeps its id. */
export function pluginLabel(sourceInfo: SourceInfo): string {
  if (sourceInfo.source.startsWith('agent-plugin:')) {
    return sourceInfo.source.slice('agent-plugin:'.length);
  }
  // A package skill's `source` is the package as it is written in settings: a folder or `npm:name`.
  if (sourceInfo.origin === 'package') {
    return tidy(path.basename(sourceInfo.source.replace(/^(npm|git):/, '').replace(/@[^/@]+$/, '')));
  }
  // Otherwise the skills sit in a `skills` folder, and the package is the one above it.
  const base = sourceInfo.baseDir ?? path.dirname(path.dirname(sourceInfo.path));
  return tidy(path.basename(base) === 'skills' ? path.basename(path.dirname(base)) : path.basename(base));
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

interface LoadedSkills {
  skills: readonly Skill[];
  diagnostics: readonly ResourceDiagnostic[];
}

/**
 * A package's skills are plugin skills whatever scope Pi gives them, so
 * `origin` decides first. Skills from a project folder Sero itself sits in are
 * not a workspace's, so they are left out.
 */
function groupOf(sourceInfo: SourceInfo): 'user' | 'plugin' | null {
  if (sourceInfo.origin === 'package') return 'plugin';
  if (sourceInfo.scope === 'user') return 'user';
  return sourceInfo.scope === 'project' ? null : 'plugin';
}

/**
 * Pi drops the later of two skills with one name and only reports it as a
 * collision. The page still lists that copy, marked as not used, so it reads
 * each dropped file itself.
 */
function droppedCopies(diagnostics: readonly ResourceDiagnostic[]): SkillCatalogueEntry[] {
  const copies: SkillCatalogueEntry[] = [];
  for (const diagnostic of diagnostics) {
    const droppedPath = diagnostic.collision?.resourceType === 'skill'
      ? diagnostic.collision.loserPath
      : diagnostic.message.startsWith('Skipped Agent Plugin skill with duplicate name') ? diagnostic.path : undefined;
    if (!droppedPath) continue;
    try {
      const { frontmatter } = parseFrontmatter<SkillFrontmatter>(readFileSync(droppedPath, 'utf-8'));
      const inProfile = path.resolve(droppedPath).startsWith(path.resolve(SKILLS_DIR) + path.sep);
      copies.push({
        name: frontmatter.name || path.basename(path.dirname(droppedPath)),
        description: frontmatter.description ?? '',
        filePath: droppedPath,
        scope: inProfile ? 'user' : 'plugin',
        origin: inProfile ? 'user' : pluginLabel({ path: droppedPath, source: 'auto', scope: 'user', origin: 'top-level' }),
        disableModelInvocation: frontmatter['disable-model-invocation'] === true,
      });
    } catch {
      // A file that cannot be read is not a skill the page can show.
    }
  }
  return copies;
}

/**
 * `available` is what Sero's resource loader finds outside any project: the
 * profile's skills and the plugin skills, plus the copies it dropped because a
 * skill with the same name came first.
 */
export function buildSkillCatalogue(available: LoadedSkills, workspaces: readonly CatalogueWorkspace[]): SkillCatalogue {
  const skills: SkillCatalogueEntry[] = [];
  for (const skill of available.skills) {
    const group = groupOf(skill.sourceInfo);
    if (group === 'user') skills.push(entryOf(skill, 'user', 'user'));
    else if (group === 'plugin') skills.push(entryOf(skill, 'plugin', pluginLabel(skill.sourceInfo)));
  }
  // Dropped copies come after the skills that beat them, so the first of two equal ranks wins.
  skills.push(...droppedCopies(available.diagnostics));

  const projects: SkillCatalogueProject[] = [];
  for (const workspace of workspaces) {
    const dir = projectSkillsRoot(workspace.path);
    if (!dir || !existsSync(dir)) continue;
    const found = loadSkillsFromDir({ dir, source: 'project' }).skills;
    if (found.length === 0) continue;
    projects.push({ id: workspace.id, name: workspace.name });
    for (const skill of found) skills.push(entryOf(skill, 'project', workspace.id));
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills, projects };
}
