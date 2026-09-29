import { describe, expect, it } from 'vitest';
import { ALL_PROJECTS, duplicateNote, groupSkills, matchesQuery, skillsInView, statusOf, unusedCount, type SkillEntry } from './skill-catalogue';

const skill = (over: Partial<SkillEntry>): SkillEntry => ({
  name: 'commit-message',
  description: 'Writes commit messages',
  filePath: `/${over.scope ?? 'user'}/${over.origin ?? 'user'}/${over.name ?? 'commit-message'}/SKILL.md`,
  scope: 'user',
  origin: 'user',
  disableModelInvocation: false,
  ...over,
});

const mine = skill({});
const projectCopy = skill({ scope: 'project', origin: 'sero' });
const otherProjectCopy = skill({ scope: 'project', origin: 'site' });
const pluginCopy = skill({ scope: 'plugin', origin: 'memory' });
const all = [mine, projectCopy, otherProjectCopy, pluginCopy];
const names = new Map([['sero', 'Sero'], ['site', 'Marketing site']]);

describe('which skill a chat uses when names repeat', () => {
  it('lets the project beat your profile, and your profile beat a plugin', () => {
    const view = skillsInView(all, 'sero');
    expect(statusOf(projectCopy, view, 'sero')?.kind).toBe('wins');
    expect(statusOf(mine, view, 'sero')).toMatchObject({ kind: 'loses', by: projectCopy });
    expect(statusOf(pluginCopy, view, 'sero')?.kind).toBe('loses');
    expect(unusedCount(view, 'sero')).toBe(2);
  });

  it('names no winner across all projects, because each project decides for itself', () => {
    const view = skillsInView(all, ALL_PROJECTS);
    expect(view).toHaveLength(4);
    expect(statusOf(mine, view, ALL_PROJECTS)?.kind).toBe('shared');
    expect(unusedCount(view, ALL_PROJECTS)).toBe(0);
  });

  it('says nothing about a name that appears once', () => {
    expect(statusOf(mine, [mine], ALL_PROJECTS)).toBeNull();
  });

  it('hides other projects skills when one project is chosen', () => {
    expect(skillsInView(all, 'sero')).not.toContain(otherProjectCopy);
  });
});

describe('the list', () => {
  it('shows Yours, Plugins, then a group per project', () => {
    const groups = groupSkills(all, [{ id: 'sero', name: 'Sero' }, { id: 'site', name: 'Marketing site' }], ALL_PROJECTS);
    expect(groups.map((g) => g.label)).toEqual(['Yours', 'Plugins', 'Project: Sero', 'Project: Marketing site']);
  });

  it('finds a skill by the project it lives in', () => {
    expect(matchesQuery(projectCopy, 'marketing', names)).toBe(false);
    expect(matchesQuery(otherProjectCopy, 'marketing', names)).toBe(true);
  });

  it('explains a losing skill by naming the winner', () => {
    const note = duplicateNote({ kind: 'loses', by: projectCopy }, 'Sero', names);
    expect(note.lead).toBe('Not used in Sero.');
    expect(note.text).toContain('The Sero project has a skill with the same name');
  });
});
