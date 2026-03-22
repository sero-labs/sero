import type { Skill } from '@mariozechner/pi-coding-agent';
import { getDisabledModelSkills } from '../../../packages/pi-admin-extension/shared/skill-visibility';

interface SkillLoadResult {
  skills: Skill[];
  diagnostics: unknown[];
}

function applySkillVisibilitySettings(skills: Skill[], settings: unknown): Skill[] {
  const disabledByUser = new Set(getDisabledModelSkills(settings));

  return skills.map((skill) => {
    const shouldHide = skill.disableModelInvocation === true || disabledByUser.has(skill.name);

    if (skill.disableModelInvocation === shouldHide) {
      return skill;
    }

    return {
      ...skill,
      disableModelInvocation: shouldHide,
    };
  });
}

/**
 * Apply user-configured skill visibility on top of each skill's own frontmatter.
 *
 * Skills with `disable-model-invocation: true` stay hidden permanently.
 * Everything else is visible by default unless the user disables it in Admin.
 */
export function createSkillVisibilityOverride(
  settingsManager: { getGlobalSettings(): unknown },
) {
  return <T extends SkillLoadResult>(current: T): T => ({
    ...current,
    skills: applySkillVisibilitySettings(current.skills, settingsManager.getGlobalSettings()),
  });
}
