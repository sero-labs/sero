import { describe, expect, it } from 'vitest';

import { getCavemanLevel, getCavemanPromptAddition } from '../caveman';

describe('caveman mode memory parsing', () => {
  it('uses explicit caveman mode level from USER.md context', () => {
    const context = '# User\n\n- **Communication:** Direct\n- **Caveman Mode:** ultra';

    expect(getCavemanLevel(context)).toBe('ultra');
  });

  it('defaults to full when communication selected caveman but no level is stored', () => {
    const context = '# User\n\n- **Communication:** Direct, Caveman mode — compressed replies';

    expect(getCavemanLevel(context)).toBe('full');
  });

  it('does not enable caveman mode when stored as off', () => {
    const context = '# User\n\n- **Communication:** Direct\n- **Caveman Mode:** off';

    expect(getCavemanLevel(context)).toBeNull();
  });

  it('uses the latest profile field when older response-style memories conflict', () => {
    const context = [
      '# User',
      '',
      '- **Communication:** Caveman mode — compressed replies',
      '- **Caveman Mode:** full',
      '',
      'Communication: Ultra caveman mode — even more compressed.',
    ].join('\n');

    expect(getCavemanLevel(context)).toBe('ultra');
  });

  it('supports loose appended off fields so contaminated profiles recover', () => {
    const context = [
      '# User',
      '',
      '- **Communication:** Caveman mode — compressed replies',
      '- **Caveman Mode:** full',
      '',
      'Communication: Caveman mode off when user asks; use normal concise style.',
    ].join('\n');

    expect(getCavemanLevel(context)).toBeNull();
  });

  it('builds level-specific prompt additions', () => {
    const addition = getCavemanPromptAddition('# User\n\n- **Caveman Mode:** lite');

    expect(addition).toContain('## Caveman Mode');
    expect(addition).toContain('Caveman Lite mode');
    expect(addition).toContain('Code blocks: write normally');
  });
});
