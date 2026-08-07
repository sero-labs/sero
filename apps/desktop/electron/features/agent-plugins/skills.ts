import { loadSkillsFromDir } from '@earendil-works/pi-coding-agent';
import type { ResourceDiagnostic, Skill } from '@earendil-works/pi-coding-agent';
import path from 'node:path';
import { readAgentPluginRegistrySync } from './registry';

interface SkillLoadResult {
  skills: Skill[];
  diagnostics: ResourceDiagnostic[];
}

export function withAgentPluginSkills(base: SkillLoadResult): SkillLoadResult {
  const plugins = readAgentPluginRegistrySync().plugins.filter((plugin) => plugin.enabled);
  if (plugins.length === 0) return base;

  const skills = [...base.skills];
  const diagnostics = [...base.diagnostics];
  const knownNames = new Set(skills.map((skill) => skill.name));

  for (const plugin of plugins) {
    for (const record of plugin.skills.filter((skill) => skill.valid)) {
      const loaded = loadSkillsFromDir({
        dir: path.dirname(record.filePath),
        source: `agent-plugin:${plugin.id}`,
      });
      const skill = loaded.skills.find((candidate) => candidate.name === record.name);
      if (!skill) {
        diagnostics.push({
          type: 'warning',
          message: `Agent Plugin skill is no longer valid: ${plugin.manifest.name}/${record.name}`,
          path: record.filePath,
        });
        continue;
      }
      if (knownNames.has(skill.name)) {
        diagnostics.push({
          type: 'warning',
          message: `Skipped Agent Plugin skill with duplicate name: ${skill.name}`,
          path: record.filePath,
        });
        continue;
      }
      knownNames.add(skill.name);
      skills.push(skill);
      diagnostics.push(...loaded.diagnostics);
    }
  }

  return { skills, diagnostics };
}
