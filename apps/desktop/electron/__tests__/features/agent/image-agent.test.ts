import { afterEach, describe, expect, it } from 'vitest';

import {
  exposeImageAgent,
  generateImages,
} from '@electron/features/agent/assistants/image-agent';

describe('image agent', () => {
  afterEach(() => {
    delete globalThis.__seroImageGen;
  });

  it('exposes the image generator on globalThis without any casts', () => {
    exposeImageAgent();

    expect(globalThis.__seroImageGen).toBe(generateImages);
  });
});
