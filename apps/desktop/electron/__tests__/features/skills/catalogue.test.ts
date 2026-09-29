import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ResourceDiagnostic, Skill } from '@earendil-works/pi-coding-agent';

import { buildSkillCatalogue, pluginLabel, projectSkillsDir, projectSkillsRoot } from '@electron/features/skills/catalogue';
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

function loaded(
  name: string,
  scope: 'user' | 'project' | 'temporary',
  source: string,
  baseDir: string,
  origin: 'top-level' | 'package' = 'top-level',
): Skill {
  return {
    name,
    description: `${name} skill`,
    filePath: path.join(baseDir, name, 'SKILL.md'),
    baseDir,
    sourceInfo: { path: path.join(baseDir, name, 'SKILL.md'), source, scope, origin, baseDir },
    disableModelInvocation: false,
  } as Skill;
}

describe('skill catalogue', () => {
  it('sorts loaded skills into yours and plugins, and reads each project from disk', () => {
    const project = workspaceWithSkill('deploy');
    const empty = mkdtempSync(path.join(tmpdir(), 'skills-catalogue-'));
    roots.push(empty);

    const catalogue = buildSkillCatalogue(
      {
        skills: [
          loaded('mine', 'user', 'auto', '/profile/skills'),
          loaded('recall', 'temporary', 'auto', '/repo/plugins/sero-memory-plugin/skills'),
          loaded('other-project', 'project', 'auto', '/somewhere/.pi/skills'),
        ],
        diagnostics: [],
      },
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

  it('counts a package skill as a plugin skill, whatever scope Pi gives it', () => {
    const catalogue = buildSkillCatalogue(
      {
        skills: [
          loaded('lint', 'project', 'npm:@acme/sero-lint-plugin@1.2.0', '/cache/skills', 'package'),
          loaded('fmt', 'user', '/pkgs/formatter', '/pkgs/formatter/skills', 'package'),
        ],
        diagnostics: [],
      },
      [],
    );
    expect(catalogue.skills.map((s) => `${s.scope}:${s.origin}:${s.name}`)).toEqual([
      'plugin:formatter:fmt',
      'plugin:lint:lint',
    ]);
  });

  it('lists a copy Pi dropped for a same-name skill, after the skill that beat it', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'skills-catalogue-'));
    roots.push(dir);
    const droppedDir = path.join(dir, 'sero-notes-plugin', 'skills', 'recall');
    mkdirSync(droppedDir, { recursive: true });
    const dropped = path.join(droppedDir, 'SKILL.md');
    writeFileSync(dropped, '---\nname: recall\ndescription: The plugin copy\ndisable-model-invocation: true\n---\nbody\n');
    const winner = path.join('/profile/skills', 'recall', 'SKILL.md');
    const diagnostics: ResourceDiagnostic[] = [{
      type: 'collision',
      message: 'name "recall" collision',
      path: dropped,
      collision: { resourceType: 'skill', name: 'recall', winnerPath: winner, loserPath: dropped },
    }];

    const catalogue = buildSkillCatalogue(
      { skills: [loaded('recall', 'user', 'auto', '/profile/skills')], diagnostics },
      [],
    );
    expect(catalogue.skills.map((s) => `${s.scope}:${s.origin}:${s.filePath === dropped ? 'dropped' : 'kept'}`)).toEqual([
      'user:user:kept',
      'plugin:notes:dropped',
    ]);
    expect(catalogue.skills[1]).toMatchObject({ description: 'The plugin copy', disableModelInvocation: true });
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

  it('refuses a project skill that a symlink points out of the project folder', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'skills-catalogue-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'skills-outside-'));
    roots.push(project, outside);
    const skillsDir = projectSkillsDir(project);
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(outside, 'SKILL.md'), 'secret');
    symlinkSync(outside, path.join(skillsDir, 'linked'));
    mkdirSync(path.join(skillsDir, 'real'));

    const escaped = path.join(skillsDir, 'linked', 'SKILL.md');
    expect(() => validateSkillPath(escaped, [skillsDir], [skillsDir])).toThrow();
    // The same link is allowed in a folder that is not strict, like the profile's.
    expect(() => validateSkillPath(escaped, [skillsDir])).not.toThrow();
    expect(() => validateSkillPath(path.join(skillsDir, 'real', 'SKILL.md'), [skillsDir], [skillsDir])).not.toThrow();
    // A new file under a real folder that does not exist yet stays inside.
    expect(() => validateSkillPath(path.join(skillsDir, 'new', 'SKILL.md'), [skillsDir], [skillsDir])).not.toThrow();
  });

  it('refuses a project whose skills folder is itself a symlink out of the project', () => {
    const project = mkdtempSync(path.join(tmpdir(), 'skills-catalogue-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'skills-outside-'));
    roots.push(project, outside);
    mkdirSync(path.join(outside, 'stolen'));
    writeFileSync(path.join(outside, 'stolen', 'SKILL.md'), '---\nname: stolen\ndescription: x\n---\nbody\n');
    mkdirSync(path.join(project, '.agents'));
    symlinkSync(outside, projectSkillsDir(project));

    expect(projectSkillsRoot(project)).toBeNull();
    // It is not listed either, so the page never offers the outside file.
    expect(buildSkillCatalogue({ skills: [], diagnostics: [] }, [{ id: 'a', name: 'Site', path: project }]).skills).toEqual([]);
    // A link to a folder inside the project is fine.
    const inside = workspaceWithSkill('deploy');
    expect(projectSkillsRoot(inside)).toBe(projectSkillsDir(inside));
  });
});
