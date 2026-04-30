import { describe, expect, it } from 'vitest';

import type { ImageGenParams } from '@electron/features/agent/assistants/image-agent';

describe('image agent contracts', () => {
  it('supports the Gemini image model IDs used by ImageGen surfaces', () => {
    const params = {
      prompt: 'test',
      model: 'gemini-2.5-flash-image',
      variations: 1,
      aspectRatio: '1:1',
    } satisfies ImageGenParams;

    expect(params.model).toBe('gemini-2.5-flash-image');
  });
});
