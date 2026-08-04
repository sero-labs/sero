import { useAppTools } from '@sero-ai/app-runtime';
import { Button, Input, TooltipProvider } from '@sero-ai/ui';
import { useEffect, useState } from 'react';

import type { CredentialStatus } from '../../shared/media';
import type { MediaSettings as MediaSettingsValue } from '../../shared/settings';
import { MAX_CALLS_PER_RUN } from '../../shared/settings';
import { CountStepper } from './CountStepper';
import { MediaModelSettings } from './MediaModelSettings';

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

export interface MediaSettingsProps {
  media: MediaSettingsValue;
}

export function MediaSettings({ media }: MediaSettingsProps) {
  const tools = useAppTools();
  const run = (params: Record<string, unknown>) => tools.run('design_library_settings', params);

  return (
    <TooltipProvider>
      <Section title="Media models">
        <MediaModelSettings
          media={media}
          onChange={(capability, mediaModel) =>
            void run({ action: 'set-media-model', capability, mediaModel })
          }
        />
      </Section>

      <CallCap
        callsPerRun={media.callsPerRun}
        onChange={(callsPerRun) => void run({ action: 'set-media-cap', callsPerRun })}
      />

      <ProviderKey />
    </TooltipProvider>
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
          editable
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
