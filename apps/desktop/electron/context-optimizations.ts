import type { Skill } from '@mariozechner/pi-coding-agent';

/**
 * Skills that stay visible to the model by default.
 *
 * Everything else remains loaded and can still be invoked explicitly via
 * `/skill:name`, but is hidden from the always-on `<available_skills>` block
 * to reduce baseline token usage.
 */
export const MODEL_VISIBLE_SKILL_NAMES = new Set([
  'ai-elements',
  'context-management',
  'context7',
  'humanizer',
  'plan-exit-review',
  'research',
  'visual-explainer',
]);

interface SkillLoadResult {
  skills: Skill[];
  diagnostics: unknown[];
}

/**
 * Hide rarely used skills from automatic model invocation while keeping them
 * installed and available for explicit `/skill:name` usage.
 */
export function applyDefaultSkillVisibility<T extends SkillLoadResult>(current: T): T {
  return {
    ...current,
    skills: current.skills.map((skill) => {
      const shouldHide =
        skill.disableModelInvocation === true ||
        !MODEL_VISIBLE_SKILL_NAMES.has(skill.name);

      if (skill.disableModelInvocation === shouldHide) {
        return skill;
      }

      return {
        ...skill,
        disableModelInvocation: shouldHide,
      };
    }),
  };
}
