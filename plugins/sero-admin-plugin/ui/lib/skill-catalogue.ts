/**
 * Pure rules for the Skills page: which skill a chat uses when two share a name,
 * which skills a project view shows, and how the list is grouped and searched.
 */

import type { SkillCatalogueEntryIPC, SkillScopeIPC } from '../hooks/host';

export type SkillEntry = SkillCatalogueEntryIPC;

/** The workspace filter value that shows every project. */
export const ALL_PROJECTS = 'all';

/**
 * Pi keeps the first skill it loads for a name: project, then the profile, then
 * plugins. A lower number wins.
 */
const PRECEDENCE: Record<SkillScopeIPC, number> = { project: 0, user: 1, plugin: 2 };

export type SkillStatus =
  | { kind: 'wins'; others: SkillEntry[] }
  | { kind: 'loses'; by: SkillEntry }
  /** Several projects share a name and no one project is chosen, so no copy wins. */
  | { kind: 'shared'; others: SkillEntry[] };

export interface SkillGroup {
  key: string;
  label: string;
  skills: SkillEntry[];
}

/** A skill is picked by its file, since names can repeat across sources. */
export const skillKey = (skill: SkillEntry): string => skill.filePath;

/** The skills that one workspace filter shows: every non-project skill, plus the chosen project's. */
export function skillsInView(skills: readonly SkillEntry[], workspace: string): SkillEntry[] {
  return skills.filter((skill) => skill.scope !== 'project' || workspace === ALL_PROJECTS || skill.origin === workspace);
}

export function statusOf(skill: SkillEntry, inView: readonly SkillEntry[], workspace: string): SkillStatus | null {
  // A skill outside the view is not part of the comparison, whatever its name.
  if (!inView.includes(skill)) return null;
  const same = inView.filter((other) => other.name === skill.name);
  if (same.length < 2) return null;
  const others = same.filter((other) => other !== skill);
  if (workspace === ALL_PROJECTS) return { kind: 'shared', others };
  const winner = [...same].sort((a, b) => PRECEDENCE[a.scope] - PRECEDENCE[b.scope])[0];
  return winner === skill ? { kind: 'wins', others } : { kind: 'loses', by: winner };
}

export function unusedCount(inView: readonly SkillEntry[], workspace: string): number {
  return inView.filter((skill) => statusOf(skill, inView, workspace)?.kind === 'loses').length;
}

/** The name shown for where a skill comes from. */
export function originName(skill: SkillEntry, projectNames: ReadonlyMap<string, string>): string {
  if (skill.scope === 'project') return projectNames.get(skill.origin) ?? skill.origin;
  return skill.scope === 'plugin' ? skill.origin : 'Yours';
}

export function matchesQuery(skill: SkillEntry, query: string, projectNames: ReadonlyMap<string, string>): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const origin = skill.scope === 'user' ? '' : originName(skill, projectNames);
  return `${skill.name} ${skill.description} ${origin}`.toLowerCase().includes(q);
}

/** Yours, then Plugins, then one group per project, each sorted by name. */
export function groupSkills(
  skills: readonly SkillEntry[],
  projects: ReadonlyArray<{ id: string; name: string }>,
  workspace: string,
): SkillGroup[] {
  const byName = (a: SkillEntry, b: SkillEntry) => a.name.localeCompare(b.name);
  const groups: SkillGroup[] = [
    { key: 'user', label: 'Yours', skills: skills.filter((s) => s.scope === 'user').sort(byName) },
    { key: 'plugin', label: 'Plugins', skills: skills.filter((s) => s.scope === 'plugin').sort(byName) },
  ];
  for (const project of projects) {
    if (workspace !== ALL_PROJECTS && workspace !== project.id) continue;
    groups.push({
      key: `project:${project.id}`,
      label: `Project: ${project.name}`,
      skills: skills.filter((s) => s.scope === 'project' && s.origin === project.id).sort(byName),
    });
  }
  return groups;
}

/** Plain sentence for where a skill lives, for use inside a note. */
function placeOf(skill: SkillEntry, projectNames: ReadonlyMap<string, string>): string {
  if (skill.scope === 'project') return `the ${originName(skill, projectNames)} project`;
  return skill.scope === 'plugin' ? `the ${skill.origin} plugin` : 'your profile';
}

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The lead and body of the note that explains a duplicate name. */
export function duplicateNote(
  status: SkillStatus,
  workspaceName: string,
  projectNames: ReadonlyMap<string, string>,
): { lead: string; text: string } {
  const list = (others: SkillEntry[]) => others.map((other) => capitalise(placeOf(other, projectNames))).join(' and ');
  if (status.kind === 'loses') {
    return {
      lead: `Not used in ${workspaceName}.`,
      text: `${capitalise(placeOf(status.by, projectNames))} has a skill with the same name, and it wins. Pi loads project skills first, then yours, then plugin skills, and keeps the first one for each name.`,
    };
  }
  const verb = status.others.length > 1 ? 'have' : 'has';
  if (status.kind === 'wins') {
    return {
      lead: 'Replaces another skill.',
      text: `${list(status.others)} also ${verb} a skill with this name. In ${workspaceName} this one is used.`,
    };
  }
  return {
    lead: 'Same name in more than one place.',
    text: `${list(status.others)} also ${verb} a skill with this name. Which one a chat uses depends on its project.`,
  };
}
