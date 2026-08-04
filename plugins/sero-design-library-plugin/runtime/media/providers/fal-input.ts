import type { MediaRequest } from '../contract';

/** fal takes a named size rather than a ratio; anything unmapped is left to it. */
const IMAGE_SIZES: Record<string, string> = {
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '3:4': 'portrait_4_3',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
};

function videoInput(
  request: MediaRequest,
  durationTokens: Map<number, string | number>,
  supportsAspectRatio: boolean | undefined,
): Record<string, unknown> {
  return {
    prompt: request.prompt,
    ...(request.durationSeconds === undefined
      ? {}
      : { duration: durationTokens.get(request.durationSeconds) ?? String(request.durationSeconds) }),
    ...(request.aspectRatio === undefined || supportsAspectRatio === false
      ? {}
      : { aspect_ratio: request.aspectRatio }),
  };
}

/** Map the vendor-neutral request into the configured fal.ai endpoint input. */
export function buildFalInput(
  request: MediaRequest,
  sourceUrls: string[],
  /** The endpoint's original token for each normalized duration. */
  durationTokens: Map<number, string | number>,
  /** False when this endpoint's schema has no aspect-ratio input. */
  supportsAspectRatio?: boolean,
): Record<string, unknown> {
  const size = request.aspectRatio === undefined ? undefined : IMAGE_SIZES[request.aspectRatio];
  const shared = {
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    ...request.extra,
  };

  switch (request.capability) {
    case 'text-to-image':
      return {
        prompt: request.prompt,
        num_images: 1,
        ...(size === undefined ? {} : { image_size: size }),
        ...shared,
      };
    case 'reference-to-image':
    case 'image-to-image':
      return {
        prompt: request.prompt,
        image_url: sourceUrls[0],
        ...(size === undefined ? {} : { image_size: size }),
        ...shared,
      };
    case 'upscale':
      return {
        image_url: sourceUrls[0],
        ...(request.prompt === '' ? {} : { prompt: request.prompt }),
        ...shared,
      };
    case 'text-to-video':
      return { ...videoInput(request, durationTokens, supportsAspectRatio), ...shared };
    case 'image-to-video':
      return {
        ...videoInput(request, durationTokens, supportsAspectRatio),
        image_url: sourceUrls[0],
        ...shared,
      };
  }
}
