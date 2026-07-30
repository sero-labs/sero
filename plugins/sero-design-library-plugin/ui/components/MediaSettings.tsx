import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useState } from 'react';

import type { CredentialStatus, MediaCapability } from '../../shared/media';
import { MEDIA_CAPABILITIES } from '../../shared/media';
import type { MediaModelChoice, MediaModelChoices } from '../../shared/media-model-catalog';
import type { MediaSettings as MediaSettingsValue } from '../../shared/settings';
import { MAX_CALLS_PER_RUN } from '../../shared/settings';
import { capabilityLabel } from '../lib/asset-view';
import { CountStepper } from './CountStepper';

/**
 * Media configuration (spec §8.3, §10, D7, D9, D10).
 *
 * Configured by *capability*, never by provider. The settings tool translates
 * the active provider's catalogue into opaque model ids and display labels.
 *
 * The key is the one value here that never touches reactive state. It is read
 * and written through the tool directly, and what comes back is where the key
 * came from — never the key.
 */

const KEY_STATUS_LABEL: Record<CredentialStatus, string> = {
  env: 'Using FAL_KEY from the environment',
  stored: 'Using a key saved here',
  missing: 'No key — generation will fail until one is set',
};

const PROVIDER_DEFAULT = 'provider-default';

export interface MediaSettingsProps {
  media: MediaSettingsValue;
}

export function MediaSettings({ media }: MediaSettingsProps) {
  const tools = useAppTools();
  const run = (params: Record<string, unknown>) => tools.run('design_library_settings', params);

  return (
    <>
      <ModelIds media={media} onChange={(capability, mediaModel) =>
        void run({ action: 'set-media-model', capability, mediaModel })
      } />

      <CallCap
        callsPerRun={media.callsPerRun}
        onChange={(callsPerRun) => void run({ action: 'set-media-cap', callsPerRun })}
      />

      <ProviderKey />
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border border-b px-6 py-5 last:border-b-0">
      <h3 className="text-sm font-medium">{title}</h3>
      {description !== undefined && (
        <p className="text-muted-foreground mt-0.5 mb-3 text-sm">{description}</p>
      )}
      <div className={description === undefined ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}

function ModelIds({
  media,
  onChange,
}: {
  media: MediaSettingsValue;
  onChange(capability: MediaCapability, modelId: string): void;
}) {
  const tools = useAppTools();
  const [choices, setChoices] = useState<MediaModelChoices | null>(null);

  useEffect(() => {
    let active = true;
    void tools
      .run('design_library_settings', { action: 'list-media-models' })
      .then((result) => {
        if (active) setChoices(normalizeChoices(result.details?.models));
      })
      .catch(() => {
        if (active) setChoices(emptyChoices());
      });
    return () => {
      active = false;
    };
    // The catalogue is read once when Settings opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Section title="Media models">
      <div className="grid gap-4 sm:grid-cols-2">
        {MEDIA_CAPABILITIES.map((capability) => (
          <ModelSelect
            key={capability}
            capability={capability}
            value={media.models[capability]}
            choices={choices?.[capability] ?? []}
            loading={choices === null}
            onChange={(modelId) => onChange(capability, modelId)}
          />
        ))}
      </div>
    </Section>
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
      typeof (choice as Record<string, unknown>).label === 'string',
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

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`media-model-${capability}`}>{capabilityLabel(capability)}</Label>
      <Select
        value={value === '' ? PROVIDER_DEFAULT : value}
        disabled={loading}
        onValueChange={(modelId) => onChange(modelId === PROVIDER_DEFAULT ? '' : modelId)}
      >
        <SelectTrigger id={`media-model-${capability}`} className="w-full">
          <SelectValue placeholder="Loading models…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PROVIDER_DEFAULT}>Provider default</SelectItem>
          {value !== '' && !selectedIsListed && <SelectItem value={value}>{value}</SelectItem>}
          {choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CallCap({
  callsPerRun,
  onChange,
}: {
  callsPerRun: number;
  onChange(callsPerRun: number): void;
}) {
  return (
    <Section
      title="Media calls per run"
      description={`How many images or clips one generation run may ask for, 0–${MAX_CALLS_PER_RUN}. Going over stops further calls and is reported; it does not fail the run.`}
    >
      <div className="max-w-sm">
        <CountStepper
          label="Media calls per run"
          decrementLabel="One fewer media call"
          incrementLabel="One more media call"
          min={0}
          max={MAX_CALLS_PER_RUN}
          value={callsPerRun}
          onChange={onChange}
        />
      </div>
    </Section>
  );
}

/**
 * The provider key.
 *
 * Status is fetched rather than read from state, because the key and everything
 * derived from it stay out of reactive state on purpose. `env` is preferred and
 * labelled as such: a key in the environment wins, so saying "saved" while the
 * environment supplies a different one would make the wrong key look like the
 * cause of the next failure.
 */
function ProviderKey() {
  const tools = useAppTools();
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [entry, setEntry] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () =>
    tools
      .run('design_library_settings', { action: 'key-status' })
      .then((result) => {
        const next = (result.details ?? {}).status;
        setStatus(next === 'env' || next === 'stored' ? next : 'missing');
      })
      .catch(() => setStatus(null));

  useEffect(() => {
    void refresh();
    // Read once when Settings opens: nothing else in the app changes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (action: 'store-key' | 'clear-key') => {
    setBusy(true);
    void tools
      .run('design_library_settings', {
        action,
        ...(action === 'store-key' ? { key: entry.trim() } : {}),
      })
      .then(() => {
        setEntry('');
        return refresh();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Section
      title="Provider key"
      description="FAL_KEY from the environment is used first. A key saved here is a fallback, stored readable only by you."
    >
      <p aria-live="polite" className="text-muted-foreground mb-3 text-sm">
        {status === null ? 'Checking…' : KEY_STATUS_LABEL[status]}
      </p>

      <div className="flex items-center gap-2">
        <Input
          type="password"
          className="max-w-sm"
          aria-label="Provider key"
          placeholder={status === 'stored' ? 'Replace the saved key' : 'Paste a key'}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || entry.trim() === ''}
          onClick={() => submit('store-key')}
        >
          Save
        </Button>
        {status === 'stored' && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => submit('clear-key')}>
            Remove
          </Button>
        )}
      </div>
    </Section>
  );
}
