import { useAppTools } from '@sero-ai/app-runtime';
import {
  Button,
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sero-ai/ui';
import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { MediaCapability } from '../../shared/media';
import { MEDIA_CAPABILITIES } from '../../shared/media';
import type { MediaModelChoice, MediaModelChoices } from '../../shared/media-model-catalog';
import type { MediaSettings } from '../../shared/settings';
import { capabilityLabel } from '../lib/asset-view';

const PROVIDER_DEFAULT = 'provider-default';

const MEDIA_MODEL_USAGE: Record<MediaCapability, string> = {
  'text-to-image': 'Used when a Design creates a new image from a text prompt.',
  'reference-to-image':
    'Used when a Design creates a new image from one or more Library references.',
  'image-to-image': 'Used when a Design edits or restyles an existing image.',
  upscale: 'Used when a Design increases the resolution of an existing image.',
  'text-to-video': 'Used when a Design creates a video from a text prompt.',
  'image-to-video': 'Used when a Design animates an existing image.',
};

interface ModelOption {
  value: string;
  label: string;
  provider: string;
}

interface ModelOptionGroup {
  value: string;
  label: string;
  items: ModelOption[];
}

export interface MediaModelSettingsProps {
  media: MediaSettings;
  onChange(capability: MediaCapability, modelId: string): void;
}

export function MediaModelSettings({ media, onChange }: MediaModelSettingsProps) {
  const tools = useAppTools();
  const [choices, setChoices] = useState<MediaModelChoices>(emptyChoices);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh: boolean) => {
    setLoading(true);
    setError(null);
    return tools
      .run('design_library_settings', {
        action: 'list-media-models',
        ...(refresh ? { refresh: true } : {}),
      })
      .then((result) => setChoices(normalizeChoices(result.details?.models)))
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load(false);
    // The provider adapter caches this result across Settings visits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {MEDIA_CAPABILITIES.map((capability) => (
          <ModelSelect
            key={capability}
            capability={capability}
            value={media.models[capability]}
            choices={choices[capability]}
            loading={loading}
            onChange={(modelId) => onChange(capability, modelId)}
          />
        ))}
      </div>

      {error !== null && (
        <div className="mt-3 flex items-center gap-2" role="alert">
          <p className="text-destructive text-sm">{error}</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => void load(true)}>
            Retry
          </Button>
        </div>
      )}
    </>
  );
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

function modelChoices(value: unknown): MediaModelChoice[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (choice): choice is MediaModelChoice =>
      typeof choice === 'object' &&
      choice !== null &&
      typeof (choice as Record<string, unknown>).id === 'string' &&
      typeof (choice as Record<string, unknown>).label === 'string' &&
      typeof (choice as Record<string, unknown>).provider === 'string',
  );
}

function normalizeChoices(value: unknown): MediaModelChoices {
  if (typeof value !== 'object' || value === null) return emptyChoices();
  const source = value as Record<string, unknown>;
  return {
    'text-to-image': modelChoices(source['text-to-image']),
    'reference-to-image': modelChoices(source['reference-to-image']),
    'image-to-image': modelChoices(source['image-to-image']),
    upscale: modelChoices(source.upscale),
    'text-to-video': modelChoices(source['text-to-video']),
    'image-to-video': modelChoices(source['image-to-video']),
  };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Could not load media models.';
}

function ModelSelect({
  capability,
  value,
  choices,
  loading,
  onChange,
}: {
  capability: MediaCapability;
  value: string;
  choices: MediaModelChoice[];
  loading: boolean;
  onChange(modelId: string): void;
}) {
  const selectedIsListed = choices.some((choice) => choice.id === value);
  const listedSelection = choices.find((choice) => choice.id === value);
  const selectedLabel =
    value === '' ? 'Provider default' : (listedSelection?.label ?? value);
  const [query, setQuery] = useState(selectedLabel);
  const trimmedQuery = query.trim();
  const customIsListed = choices.some(
    (choice) =>
      choice.id.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase() ||
      choice.label.toLocaleLowerCase() === trimmedQuery.toLocaleLowerCase(),
  );
  const options: ModelOption[] = [
    { value: PROVIDER_DEFAULT, label: 'Provider default', provider: 'Default' },
    ...(value !== '' && !selectedIsListed
      ? [{ value, label: value, provider: 'Saved choice' }]
      : []),
    ...choices.map((choice) => ({
      value: choice.id,
      label: choice.label,
      provider: choice.provider,
    })),
    ...(trimmedQuery !== '' && trimmedQuery !== selectedLabel && !customIsListed
      ? [
          {
            value: trimmedQuery,
            label: trimmedQuery,
            provider: 'Custom model ID',
          },
        ]
      : []),
  ];
  const groups = groupModelOptions(options);
  const selectedValue = options.find(
    (option) => option.value === (value === '' ? PROVIDER_DEFAULT : value),
  );

  return (
    <div className="space-y-1.5">
      <MediaModelLabel capability={capability} />
      <Combobox
        items={groups}
        value={selectedValue}
        inputValue={query}
        isItemEqualToValue={(item, selected) => item.value === selected.value}
        onInputValueChange={setQuery}
        onValueChange={(model) => {
          if (model === null) return;
          setQuery(model.label);
          onChange(model.value === PROVIDER_DEFAULT ? '' : model.value);
        }}
      >
        <ComboboxInput
          id={`media-model-${capability}`}
          className="w-full"
          placeholder={loading ? 'Loading models…' : 'Search or enter a model ID'}
        />
        <ComboboxContent>
          <ComboboxEmpty>No models found</ComboboxEmpty>
          <ComboboxList>
            {(group: ModelOptionGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.label}</ComboboxLabel>
                <ComboboxCollection>
                  {(option: ModelOption) => (
                    <ComboboxItem key={`${group.value}:${option.value}`} value={option}>
                      {option.label}
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}

function MediaModelLabel({ capability }: { capability: MediaCapability }) {
  const label = capabilityLabel(capability);
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={`media-model-${capability}`}>{label}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground size-5"
            aria-label={`How ${label} is used`}
          >
            <Info className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {MEDIA_MODEL_USAGE[capability]}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function groupModelOptions(options: ModelOption[]): ModelOptionGroup[] {
  const grouped = new Map<string, ModelOption[]>();
  for (const option of options) {
    const group = grouped.get(option.provider);
    if (group === undefined) grouped.set(option.provider, [option]);
    else group.push(option);
  }
  return [...grouped].map(([provider, items]) => ({
    value: provider,
    label: provider,
    items,
  }));
}
