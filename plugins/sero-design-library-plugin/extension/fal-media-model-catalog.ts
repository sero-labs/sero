import type {
  MediaModelCatalog,
  MediaModelChoice,
  MediaModelChoices,
} from '../shared/media-model-catalog';
import type { MediaCapability } from '../shared/media';

const FAL_MODELS_URL = 'https://api.fal.ai/v1/models';
const PAGE_SIZE = 100;

interface FalModel {
  endpoint_id?: unknown;
  metadata?: {
    category?: unknown;
    display_name?: unknown;
  };
}

interface FalModelPage {
  models?: unknown;
}

export interface FalMediaModelCatalogOptions {
  fetch?: typeof globalThis.fetch;
}

function emptyChoices(): MediaModelChoices {
  return {
    'text-to-image': [],
    'reference-to-image': [],
    'image-to-image': [],
    upscale: [],
    'text-to-video': [],
    'image-to-video': [],
  };
}

function modelChoice(value: unknown): { category: string; choice: MediaModelChoice } | null {
  if (typeof value !== 'object' || value === null) return null;
  const model = value as FalModel;
  if (
    typeof model.endpoint_id !== 'string' ||
    model.endpoint_id === '' ||
    typeof model.metadata?.category !== 'string'
  ) {
    return null;
  }
  const displayName = model.metadata.display_name;
  return {
    category: model.metadata.category,
    choice: {
      id: model.endpoint_id,
      label:
        typeof displayName === 'string' && displayName !== ''
          ? `${displayName} · ${model.endpoint_id}`
          : model.endpoint_id,
      provider: model.endpoint_id.split('/')[0] ?? 'Other',
    },
  };
}

function addChoice(
  choices: MediaModelChoices,
  capability: MediaCapability,
  choice: MediaModelChoice,
): void {
  choices[capability].push(choice);
}

function classifyModels(models: unknown[]): MediaModelChoices {
  const choices = emptyChoices();
  for (const value of models) {
    const model = modelChoice(value);
    if (model === null) continue;

    switch (model.category) {
      case 'text-to-image':
        addChoice(choices, 'text-to-image', model.choice);
        break;
      case 'image-to-image':
        addChoice(choices, 'reference-to-image', model.choice);
        addChoice(choices, 'image-to-image', model.choice);
        if (/upscal/i.test(`${model.choice.label} ${model.choice.id}`)) {
          addChoice(choices, 'upscale', model.choice);
        }
        break;
      case 'text-to-video':
        addChoice(choices, 'text-to-video', model.choice);
        break;
      case 'image-to-video':
        addChoice(choices, 'image-to-video', model.choice);
        break;
    }
  }

  for (const capability of Object.keys(choices) as MediaCapability[]) {
    choices[capability].sort((left, right) => left.label.localeCompare(right.label));
  }
  return choices;
}

async function readCatalogue(
  transport: typeof globalThis.fetch,
  signal?: AbortSignal,
): Promise<MediaModelChoices> {
  const url = new URL(FAL_MODELS_URL);
  url.searchParams.set('status', 'active');
  url.searchParams.set('limit', String(PAGE_SIZE));

  const response = await transport(url, { signal });
  if (!response.ok) {
    throw new Error(`The media provider model catalogue returned ${response.status}.`);
  }

  const page = (await response.json()) as FalModelPage;
  if (!Array.isArray(page.models)) {
    throw new Error('The media provider model catalogue returned an invalid model list.');
  }
  return classifyModels(page.models);
}

/**
 * fal.ai implementation of the provider-neutral settings catalogue.
 *
 * One anonymous request reads a useful working set. The adapter caches it
 * across Settings visits. Users can still enter an endpoint that is not in the
 * working set, so discovery does not need to crawl every provider page.
 */
export function createFalMediaModelCatalog(
  options: FalMediaModelCatalogOptions = {},
): MediaModelCatalog {
  const transport = options.fetch ?? globalThis.fetch;
  let cached: MediaModelChoices | undefined;

  return {
    async list({ refresh = false, signal } = {}) {
      if (!refresh && cached !== undefined) return cached;
      const choices = await readCatalogue(transport, signal);
      cached = choices;
      return choices;
    },
  };
}
