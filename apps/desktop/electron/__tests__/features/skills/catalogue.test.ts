import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Skill } from '@earendil-works/pi-coding-agent';

import { buildSkillCatalogue, pluginLabel, projectSkillsDir } from '@electron/features/skills/catalogue';
import { validateSkillPath } from '@electron/features/skills/store';

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function workspaceWithSkill(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skills-catalogue-'));
  roots.push(dir);
  const skillDir = path.join(projectSkillsDir(dir), name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: A ${name} skill\n---\nbody\n`);
  return dir;
}

function loaded(name: string, scope: 'user' | 'project' | 'temporary', source: string, baseDir: string): Skill {
  return {
    name,
    description: `${name} skill`,
    filePath: path.join(baseDir, name, 'SKILL.md'),
    baseDir,
    sourceInfo: { path: path.join(baseDir, name, 'SKILL.md'), source, scope, origin: 'top-level', baseDir },
    disableModelInvocation: false,
  } as Skill;
}

describe('skill catalogue', () => {
  it('sorts loaded skills into yours and plugins, and reads each project from disk', () => {
    const project = workspaceWithSkill('deploy');
    const empty = mkdtempSync(path.join(tmpdir(), 'skills-catalogue-'));
    roots.push(empty);

    const catalogue = buildSkillCatalogue(
      [
        loaded('mine', 'user', 'auto', '/profile/skills'),
        loaded('recall', 'temporary', 'auto', '/repo/plugins/sero-memory-plugin/skills'),
        loaded('other-project', 'project', 'auto', '/somewhere/.pi/skills'),
      ],
      [{ id: 'a', name: 'Site', path: project }, { id: 'b', name: 'Empty', path: empty }],
    );

    expect(catalogue.skills.map((s) => `${s.scope}:${s.origin}:${s.name}`)).toEqual([
      'project:a:deploy',
      'user:user:mine',
      'plugin:memory:recall',
    ]);
    // A project with no skills of its own is not offered as a choice.
    expect(catalogue.projects).toEqual([{ id: 'a', name: 'Site' }]);
  });

  it('gives a plugin a short name', () => {
    expect(pluginLabel({ path: '/x', source: 'agent-plugin:release-notes', scope: 'user', origin: 'top-level' })).toBe('release-notes');
  });
});

describe('skill paths the Skills page may write', () => {
  it('allows a project skill only when its folder is passed, and never a sibling folder', () => {
    const project = '/work/site';
    const skill = path.join(projectSkillsDir(project), 'deploy', 'SKILL.md');
    expect(() => validateSkillPath(skill)).toThrow();
    expect(() => validateSkillPath(skill, [projectSkillsDir(project)])).not.toThrow();
    expect(() => validateSkillPath('/work/site-other/.agents/skills/x/SKILL.md', [projectSkillsDir(project)])).toThrow();
  });
});
