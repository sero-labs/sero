import { describe, expect, it } from 'vitest';
import type { AvailableModelGroup } from './types';
import {
  buildManagerCollections,
  buildManagerCounts,
  filterManagerGroups,
  getManagerEmptyMessage,
} from './runtime';

const groups: AvailableModelGroup[] = [
  {
    provider: 'anthropic',
    displayName: 'Anthropic',
    logo: 'anthropic.svg',
    models: [
      {
        provider: 'anthropic',
        api: 'anthropic-messages',
        modelId: 'claude-sonnet-4',
        name: 'Claude Sonnet 4',
        reasoning: true,
      },
      {
        provider: 'anthropic',
        api: 'anthropic-messages',
        modelId: 'claude-haiku-4',
        name: 'Claude Haiku 4',
        reasoning: false,
      },
    ],
  },
  {
    provider: 'openai',
    displayName: 'OpenAI',
    logo: 'openai.svg',
    models: [
      {
        provider: 'openai',
        api: 'openai-responses',
        modelId: 'gpt-4.1',
        name: 'GPT-4.1',
        reasoning: true,
      },
    ],
  },
];

describe('filterManagerGroups', () => {
  it('matches by model and provider name while preserving group metadata', () => {
    expect(filterManagerGroups(groups, 'open')).toEqual([
      {
        provider: 'openai',
        displayName: 'OpenAI',
        logo: 'openai.svg',
        models: [groups[1]!.models[0]!],
      },
    ]);
  });
});

describe('buildManagerCollections', () => {
  it('derives favourite and hidden groups, including provider-hidden models', () => {
    expect(
      buildManagerCollections(groups, {
        favouriteModels: ['anthropic/claude-haiku-4'],
        hiddenModels: ['anthropic/claude-sonnet-4'],
        hiddenProviders: ['openai'],
      }),
    ).toEqual({
      favouriteGroups: [
        {
          provider: 'anthropic',
          displayName: 'Anthropic',
          logo: 'anthropic.svg',
          models: [groups[0]!.models[1]!],
        },
      ],
      hiddenGroups: [
        {
          provider: 'anthropic',
          displayName: 'Anthropic',
          logo: 'anthropic.svg',
          models: [groups[0]!.models[0]!],
        },
        {
          provider: 'openai',
          displayName: 'OpenAI',
          logo: 'openai.svg',
          models: [groups[1]!.models[0]!],
        },
      ],
    });
  });
});

describe('buildManagerCounts', () => {
  it('deduplicates hidden counts when a provider and one of its models are both hidden', () => {
    expect(
      buildManagerCounts(
        groups,
        {
          favouriteModels: ['anthropic/claude-haiku-4'],
          hiddenModels: ['openai/gpt-4.1'],
          hiddenProviders: ['openai'],
        },
        2,
      ),
    ).toEqual({
      all: 3,
      favourites: 1,
      hidden: 1,
      local: 2,
    });
  });
});

describe('getManagerEmptyMessage', () => {
  it('returns tab-specific empty copy before falling back to search copy', () => {
    expect(getManagerEmptyMessage('favourites', 'anthropic')).toBe(
      'No favourite models yet. Click the star icon to add favourites.',
    );
    expect(getManagerEmptyMessage('all', 'anthropic')).toBe('No models matching "anthropic"');
  });
});
