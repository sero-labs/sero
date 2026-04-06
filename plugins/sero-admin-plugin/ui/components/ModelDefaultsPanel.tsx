import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { getSero, type ProviderDefaultsState, type ProviderModelDefaults } from '../hooks/useSeroFiles';

type TierKey = 'LOW' | 'MED' | 'HIGH';
type EditableTierDefaults = Record<TierKey, string>;

const TIERS: readonly TierKey[] = ['LOW', 'MED', 'HIGH'] as const;

function toEditableDefaults(defaults: ProviderModelDefaults): Record<string, EditableTierDefaults> {
  const result: Record<string, EditableTierDefaults> = {};
  for (const [providerId, tiers] of Object.entries(defaults)) {
    result[providerId] = {
      LOW: tiers.LOW ?? '',
      MED: tiers.MED ?? '',
      HIGH: tiers.HIGH ?? '',
    };
  }
  return result;
}

function normalizeDefaults(draft: Record<string, EditableTierDefaults>): ProviderModelDefaults {
  const result: ProviderModelDefaults = {};

  for (const [providerId, tiers] of Object.entries(draft)) {
    const normalizedProviderId = providerId.trim();
    if (!normalizedProviderId) continue;

    const nextTiers: Partial<Record<TierKey, string>> = {};
    for (const tier of TIERS) {
      const value = tiers[tier].trim();
      if (!value) continue;
      nextTiers[tier] = value;
    }

    if (Object.keys(nextTiers).length > 0) {
      result[normalizedProviderId] = nextTiers;
    }
  }

  return result;
}

function effectiveLabel(state: ProviderDefaultsState | null, providerId: string, tier: TierKey): string {
  return state?.effectiveDefaults[providerId]?.[tier] ?? '—';
}

export function ModelDefaultsPanel() {
  const [state, setState] = useState<ProviderDefaultsState | null>(null);
  const [draft, setDraft] = useState<Record<string, EditableTierDefaults>>({});
  const [newProviderId, setNewProviderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const nextState = await getSero().providerDefaults.get();
      setState(nextState);
      setDraft(toEditableDefaults(nextState.globalDefaults));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load provider defaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providerIds = useMemo(() => {
    const ids = new Set<string>([
      ...Object.keys(state?.builtInDefaults ?? {}),
      ...Object.keys(draft),
      ...Object.keys(state?.effectiveDefaults ?? {}),
    ]);
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [draft, state]);

  const updateTier = useCallback((providerId: string, tier: TierKey, value: string) => {
    setDraft((current) => ({
      ...current,
      [providerId]: {
        LOW: current[providerId]?.LOW ?? '',
        MED: current[providerId]?.MED ?? '',
        HIGH: current[providerId]?.HIGH ?? '',
        [tier]: value,
      },
    }));
  }, []);

  const addProvider = useCallback(() => {
    const providerId = newProviderId.trim();
    if (!providerId) return;
    setDraft((current) => ({
      ...current,
      [providerId]: current[providerId] ?? { LOW: '', MED: '', HIGH: '' },
    }));
    setNewProviderId('');
  }, [newProviderId]);

  const clearProviderOverride = useCallback((providerId: string) => {
    setDraft((current) => {
      const { [providerId]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await getSero().providerDefaults.setGlobalDefaults(normalizeDefaults(draft));
      setNotice('Global provider defaults saved.');
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save provider defaults');
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading model defaults…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Provider model defaults</h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              These global defaults feed onboarding recommendations across profiles. Leave a field blank to fall back to built-in defaults.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()}>
              Reload
            </Button>
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save defaults'}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Input
            value={newProviderId}
            onChange={(event) => setNewProviderId(event.target.value)}
            placeholder="Add provider id…"
            className="h-8 text-xs"
          />
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={addProvider}>
            Add provider
          </Button>
        </div>

        {error ? (
          <p className="mt-2 text-[11px] text-destructive">{error}</p>
        ) : null}
        {notice ? (
          <p className="mt-2 text-[11px] text-primary">{notice}</p>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {providerIds.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/40 px-4 py-8 text-center text-xs text-muted-foreground/60">
              No provider defaults yet.
            </div>
          ) : (
            providerIds.map((providerId) => {
              const builtIn = state?.builtInDefaults[providerId];
              const effective = state?.effectiveDefaults[providerId];
              const editable = draft[providerId] ?? { LOW: '', MED: '', HIGH: '' };

              return (
                <div key={providerId} className="rounded-xl border border-border/40 bg-background/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{providerId}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        Effective: {TIERS.map((tier) => `${tier} ${effectiveLabel(state, providerId, tier)}`).join(' · ')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-[11px] text-muted-foreground"
                      onClick={() => clearProviderOverride(providerId)}
                    >
                      Clear override
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {TIERS.map((tier) => (
                      <label key={tier} className="space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                          {tier}
                        </span>
                        <Input
                          value={editable[tier]}
                          onChange={(event) => updateTier(providerId, tier, event.target.value)}
                          placeholder={builtIn?.[tier] ?? effective?.[tier] ?? 'model-id'}
                          className="h-8 text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground/60">
                          Built-in: {builtIn?.[tier] ?? '—'}
                        </p>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
