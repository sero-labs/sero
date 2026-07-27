import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareToolImage: vi.fn(),
}));

vi.mock('@electron/shared/media/image-resize', () => ({
  prepareToolImage: mocks.prepareToolImage,
}));

import { createMediaHost } from '@electron/features/apps/runtime/capabilities/media';

/**
 * Background runtimes get the same image budget as the app's own tools. The
 * point of the capability is that there is one definition of "small enough to
 * send", so these check it really delegates rather than reimplementing limits.
 */
describe('the media capability for app runtimes', () => {
  it('delegates to the shared resize helper and reports the outcome', async () => {
    mocks.prepareToolImage.mockReturnValue({
      data: 'resized-base64',
      mimeType: 'image/jpeg',
      text: 'Look at this\n[Image: original 4000x2000, displayed at 2000x1000.]',
      resize: {
        data: 'resized-base64',
        mimeType: 'image/jpeg',
        originalWidth: 4000,
        originalHeight: 2000,
        width: 2000,
        height: 1000,
        wasResized: true,
      },
    });

    const media = createMediaHost();
    const result = await media.prepareImage('original-base64', 'image/png', 'Look at this');

    expect(mocks.prepareToolImage).toHaveBeenCalledWith('original-base64', 'image/png', 'Look at this');
    expect(result).toEqual({
      data: 'resized-base64',
      mimeType: 'image/jpeg',
      text: 'Look at this\n[Image: original 4000x2000, displayed at 2000x1000.]',
      wasResized: true,
      width: 2000,
      height: 1000,
      originalWidth: 4000,
      originalHeight: 2000,
    });
  });

  it('reports an image that was already small enough as unresized', async () => {
    mocks.prepareToolImage.mockReturnValue({
      data: 'same-base64',
      mimeType: 'image/png',
      text: undefined,
      resize: {
        data: 'same-base64',
        mimeType: 'image/png',
        originalWidth: 800,
        originalHeight: 600,
        width: 800,
        height: 600,
        wasResized: false,
      },
    });

    const result = await createMediaHost().prepareImage('same-base64', 'image/png');

    expect(result.wasResized).toBe(false);
    expect(result.data).toBe('same-base64');
    // Absent rather than present-and-undefined: callers spread this onto a
    // tool result, where an undefined key is not the same as no key.
    expect('text' in result).toBe(false);
  });
});
