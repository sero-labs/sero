import type { LoadSkillsResult, SettingsManager } from '@earendil-works/pi-coding-agent';

import { withAgentPluginSkills } from '@electron/features/agent-plugins/skills';
import { createSkillVisibilityOverride } from '@electron/features/apps/extensions/skill-visibility';
import { filterCompatiblePluginSkills } from '@electron/features/plugins/resource-compatibility';

/**
 * Build the canonical skill pipeline for background agents and their catalogue.
 * Hidden skills stay loaded with their invocation flag so runtime and catalogue
 * describe the same authority.
 */
export function createSubagentSkillOverride(
  settingsManager: Pick<SettingsManager, 'getGlobalSettings'>,
): (base: LoadSkillsResult) => LoadSkillsResult {
  const applyVisibility = createSkillVisibilityOverride(settingsManager);

  return (base) => applyVisibility(filterCompatiblePluginSkills(withAgentPluginSkills(base)));
}
