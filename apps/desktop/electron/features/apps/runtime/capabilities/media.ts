import type { AppRuntimeMediaApi } from '@sero-ai/common';

import { prepareToolImage } from '@electron/shared/media/image-resize';

/**
 * The image budget, exposed to background runtimes.
 *
 * Plugin runtimes put images in front of models too — a design reference, a
 * screenshot, a captured page — and until this existed they had no way to spend
 * context on one the way the app itself does. The alternative was every plugin
 * inventing its own limits, or none of them bothering and sending full-size
 * originals.
 *
 * It delegates to the same helper the chat panel, browser and coding tools use,
 * so there is one definition of "small enough to send" rather than several that
 * drift.
 */
export function createMediaHost(): AppRuntimeMediaApi {
  return {
    prepareImage: async (data, mimeType, text) => {
      const prepared = prepareToolImage(data, mimeType, text);
      return {
        data: prepared.data,
        mimeType: prepared.mimeType,
        ...(prepared.text === undefined ? {} : { text: prepared.text }),
        wasResized: prepared.resize.wasResized,
        width: prepared.resize.width,
        height: prepared.resize.height,
        originalWidth: prepared.resize.originalWidth,
        originalHeight: prepared.resize.originalHeight,
      };
    },
  };
}
