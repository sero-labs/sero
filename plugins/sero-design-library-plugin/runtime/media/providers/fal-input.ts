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

/**
 * How this endpoint takes its source pictures.
 *
 * `image_url` and `image_urls` are both in use across fal, and an endpoint that
 * wants the array refuses a request carrying the string. When the schema could
 * not be read, both are sent: the older shape is what most endpoints take, and
 * an ignored extra field is cheaper than a refused request.
 */
function sourceFields(sourceUrls: string[], fields?: ReadonlySet<string>): Record<string, unknown> {
  const first = sourceUrls[0];
  if (first === undefined) return {};
  // A schema that could not be read gets what every endpoint got before any of
  // this: the single field. Guessing wider on no information would change what
  // is sent to endpoints that work today.
  if (fields === undefined || fields.size === 0) return { image_url: first };
  return {
    ...(fields.has('image_url') ? { image_url: first } : {}),
    // Every source, not just the first: a repair is shown the frame *and* the
    // character it has to stay faithful to, and an endpoint that takes an array
    // is the only place the second one can go.
    ...(fields.has('image_urls') ? { image_urls: sourceUrls } : {}),
  };
}

/**
 * Drop anything the endpoint has never heard of.
 *
 * Callers pass endpoint-shaped extras — a resolution, an audio switch, an end
 * frame — and the endpoints disagree about which of those exist. fal refuses a
 * request carrying an unknown field, so sending one to the wrong model turns a
 * paid call into an error message.
 */
function acceptedExtras(
  extra: Record<string, unknown> | undefined,
  fields?: ReadonlySet<string>,
): Record<string, unknown> {
  if (extra === undefined) return {};
  if (fields === undefined || fields.size === 0) return extra;
  return Object.fromEntries(Object.entries(extra).filter(([key]) => fields.has(key)));
}

/** Map the vendor-neutral request into the configured fal.ai endpoint input. */
export function buildFalInput(
  request: MediaRequest,
  sourceUrls: string[],
  /** The endpoint's original token for each normalized duration. */
  durationTokens: Map<number, string | number>,
  /** False when this endpoint's schema has no aspect-ratio input. */
  supportsAspectRatio?: boolean,
  /** Every input field the endpoint declares, when its schema could be read. */
  fields?: ReadonlySet<string>,
): Record<string, unknown> {
  const size = request.aspectRatio === undefined ? undefined : IMAGE_SIZES[request.aspectRatio];
  const shared = {
    ...(request.seed === undefined ? {} : { seed: request.seed }),
    ...acceptedExtras(request.extra, fields),
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
        ...sourceFields(sourceUrls, fields),
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
        // A second source is the picture the clip should finish on, where the
        // endpoint takes one. Asking a model to land where it started is the
        // only thing measured so far that improved a walk with no natural cycle
        // in it, and this is the field it goes in.
        ...(sourceUrls.length > 1 && fields?.has('end_image_url') === true
          ? { end_image_url: sourceUrls[1] }
          : {}),
        ...shared,
      };
  }
}
