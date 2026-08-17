import type { LoadSkillsResult, SettingsManager } from '@earendil-works/pi-coding-agent';

import { createSubagentSkillOverride } from '@electron/features/subagent/runtime/skill-pipeline';

/**
 * Build the skill surface that a Room can offer and restore.
 *
 * Agent Plugin discovery, host compatibility, and Admin visibility are applied
 * before an approved-name allowlist. This keeps catalogue and member loading
 * on the same fail-closed path.
 */
export function createRoomSkillOverride(
  settingsManager: Pick<SettingsManager, 'getGlobalSettings'>,
  approvedNames?: readonly string[],
): (base: LoadSkillsResult) => LoadSkillsResult {
  const loadSubagentSkills = createSubagentSkillOverride(settingsManager);
  const approved = approvedNames === undefined ? null : new Set(approvedNames);

  return (base) => {
    const visible = loadSubagentSkills(base);
    return {
      ...visible,
      skills: visible.skills.filter((skill) => (
        !skill.disableModelInvocation && (approved === null || approved.has(skill.name))
      )),
    };
  };
}
