import type {
  MediaModelCatalog,
  MediaModelChoice,
  MediaModelChoices,
} from '../shared/media-model-catalog';

const FAL_MODELS_URL = 'https://api.fal.ai/v1/models';
const PAGE_SIZE = 100;

interface FalModel {
  endpoint_id?: unknown;
  metadata?: {
    display_name?: unknown;
  };
}

interface FalModelPage {
  models?: unknown;
  has_more?: unknown;
  next_cursor?: unknown;
}

interface FalQuery {
  category: string;
  query?: string;
}

const CAPABILITY_QUERIES = {
  'text-to-image': { category: 'text-to-image' },
  'reference-to-image': { category: 'image-to-image' },
  'image-to-image': { category: 'image-to-image' },
  upscale: { category: 'image-to-image', query: 'upscale' },
  'text-to-video': { category: 'text-to-video' },
  'image-to-video': { category: 'image-to-video' },
} satisfies Record<keyof MediaModelChoices, FalQuery>;

export interface FalMediaModelCatalogOptions {
  credentials(): Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

function modelChoice(value: unknown): MediaModelChoice | null {
  if (typeof value !== 'object' || value === null) return null;
  const model = value as FalModel;
  if (typeof model.endpoint_id !== 'string' || model.endpoint_id === '') return null;
  const displayName = model.metadata?.display_name;
  return {
    id: model.endpoint_id,
    label:
      typeof displayName === 'string' && displayName !== ''
        ? `${displayName} · ${model.endpoint_id}`
        : model.endpoint_id,
    provider: model.endpoint_id.split('/')[0] ?? 'Other',
  };
}

function queryKey(query: FalQuery): string {
  return `${query.category}:${query.query ?? ''}`;
}

async function readQuery(
  query: FalQuery,
  credentials: string | undefined,
  transport: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<MediaModelChoice[]> {
  const choices: MediaModelChoice[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const url = new URL(FAL_MODELS_URL);
    url.searchParams.set('category', query.category);
    url.searchParams.set('status', 'active');
    url.searchParams.set('limit', String(PAGE_SIZE));
    if (query.query !== undefined) url.searchParams.set('q', query.query);
    if (cursor !== undefined) url.searchParams.set('cursor', cursor);

    const response = await transport(url, {
      signal,
      headers: credentials === undefined ? undefined : { Authorization: `Key ${credentials}` },
    });
    if (!response.ok) {
      throw new Error(`The media provider model catalogue returned ${response.status}.`);
    }

    const page = (await response.json()) as FalModelPage;
    if (!Array.isArray(page.models)) {
      throw new Error('The media provider model catalogue returned an invalid model list.');
    }
    choices.push(
      ...page.models.flatMap((entry) => {
        const choice = modelChoice(entry);
        return choice === null ? [] : [choice];
      }),
    );

    const next = typeof page.next_cursor === 'string' ? page.next_cursor : undefined;
    if (page.has_more !== true || next === undefined) break;
    if (seenCursors.has(next)) {
      throw new Error('The media provider model catalogue repeated a page cursor.');
    }
    seenCursors.add(next);
    cursor = next;
  } while (true);

  const unique = new Map(choices.map((choice) => [choice.id, choice]));
  return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
}

/**
 * fal.ai implementation of the provider-neutral settings catalogue.
 *
 * Duplicate capability queries share one request. Reference image and remix,
 * for example, both use the provider's image-to-image category.
 */
export function createFalMediaModelCatalog(
  options: FalMediaModelCatalogOptions,
): MediaModelCatalog {
  const transport = options.fetch ?? globalThis.fetch;

  return {
    async list(signal) {
      const credentials = await options.credentials();
      const pending = new Map<string, Promise<MediaModelChoice[]>>();
      const read = (query: FalQuery) => {
        const key = queryKey(query);
        const current = pending.get(key);
        if (current !== undefined) return current;
        const request = readQuery(query, credentials, transport, signal);
        pending.set(key, request);
        return request;
      };

      const textToImage = read(CAPABILITY_QUERIES['text-to-image']);
      const imageToImage = read(CAPABILITY_QUERIES['image-to-image']);
      const upscale = read(CAPABILITY_QUERIES.upscale);
      const textToVideo = read(CAPABILITY_QUERIES['text-to-video']);
      const imageToVideo = read(CAPABILITY_QUERIES['image-to-video']);
      const [
        textToImageChoices,
        imageToImageChoices,
        upscaleChoices,
        textToVideoChoices,
        imageToVideoChoices,
      ] = await Promise.all([textToImage, imageToImage, upscale, textToVideo, imageToVideo]);

      return {
        'text-to-image': textToImageChoices,
        'reference-to-image': imageToImageChoices,
        'image-to-image': imageToImageChoices,
        upscale: upscaleChoices,
        'text-to-video': textToVideoChoices,
        'image-to-video': imageToVideoChoices,
      };
    },
  };
}
