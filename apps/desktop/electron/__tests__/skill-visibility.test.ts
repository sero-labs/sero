import { describe, expect, it } from 'vitest';
import type { Skill } from '@mariozechner/pi-coding-agent';
import { getDisabledModelSkills, withDisabledModelSkills } from '../../../../packages/pi-admin-extension/shared/skill-visibility';
import { createSkillVisibilityOverride } from '../extensions/skill-visibility';

function makeSkill(name: string, disableModelInvocation = false): Skill {
  return {
    name,
    description: `${name} description`,
    filePath: `/skills/${name}/SKILL.md`,
    baseDir: `/skills/${name}`,
    source: 'test',
    disableModelInvocation,
  };
}

describe('skill visibility settings', () => {
  it('reads and normalises disabled model skills from settings.json', () => {
    const settings = {
      sero: {
        skillVisibility: {
          disabledModelSkills: ['transcribe', ' transcribe ', 'playwright-cli'],
        },
      },
    };

    expect(getDisabledModelSkills(settings)).toEqual(['playwright-cli', 'transcribe']);
  });

  it('writes disabled model skills without leaving empty config shells', () => {
    const settings = {
      defaultModel: 'claude-sonnet-4-6',
      sero: {
        skillVisibility: {
          disabledModelSkills: ['old-skill'],
        },
      },
    };

    expect(withDisabledModelSkills(settings, ['transcribe'])).toEqual({
      defaultModel: 'claude-sonnet-4-6',
      sero: {
        skillVisibility: {
          disabledModelSkills: ['transcribe'],
        },
      },
    });

    expect(withDisabledModelSkills(settings, [])).toEqual({
      defaultModel: 'claude-sonnet-4-6',
    });
  });

  it('keeps skills visible by default and only hides user-disabled or locked skills', () => {
    const override = createSkillVisibilityOverride({
      getGlobalSettings: () => ({
        sero: {
          skillVisibility: {
            disabledModelSkills: ['transcribe'],
          },
        },
      }),
    });

    const result = override({
      skills: [
        makeSkill('playwright-cli'),
        makeSkill('transcribe'),
        makeSkill('locked-skill', true),
      ],
      diagnostics: [],
    });

    expect(result.skills.find((skill) => skill.name === 'playwright-cli')?.disableModelInvocation).toBe(false);
    expect(result.skills.find((skill) => skill.name === 'transcribe')?.disableModelInvocation).toBe(true);
    expect(result.skills.find((skill) => skill.name === 'locked-skill')?.disableModelInvocation).toBe(true);
  });
});
