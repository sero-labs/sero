import { describe, expect, it } from 'vitest';
import { getDisabledModelSkills, withDisabledModelSkills } from '@sero/common';

describe('admin skill visibility helpers', () => {
  it('normalizes disabled skill names from settings.json', () => {
    expect(getDisabledModelSkills({
      sero: {
        skillVisibility: {
          disabledModelSkills: ['transcribe', ' transcribe ', 'playwright-cli'],
        },
      },
    })).toEqual(['playwright-cli', 'transcribe']);
  });

  it('preserves the persisted settings shape while pruning empty shells', () => {
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
});
