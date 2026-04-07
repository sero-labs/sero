/**
 * ModelDefaultsPanel — Providers panel with shared tier quick picks and
 * provider cards showing health status.
 *
 * Two sections:
 *  1. Tier quick picks — a fast way to set one preferred model per tier
 *  2. Provider list — health status, default model, per-provider overrides
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import {
  getSero,
  type AvailableModelGroupIPC,
  type ProviderDefaultsState,
  type ProviderHealthInfoIPC,
  type ProviderModelDefaults,
} from '../hooks/useSeroFiles';
import { ProviderCard } from './ProviderCard';
import { TierModelPicker, type TierModelSelection } from './TierModelPicker';

type TierKey = 'LOW' | 'MED' | 'HIGH';
const TIERS: readonly TierKey[] = ['LOW', 'MED', 'HIGH'] as const;
const EMPTY_TIER_SELECTIONS: Record<TierKey, TierModelSelection | null> = {
  LOW: null,
  MED: null,
  HIGH: null,
};

function pickUniqueTierSelection(
  defaults: ProviderModelDefaults | undefined,
  tier: TierKey,
): TierModelSelection | null {
  if (!defaults) return null;

  const matches = Object.entries(defaults)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([providerId, tiers]) => {
      const modelId = tiers[tier];
      return modelId ? [{ providerId, modelId }] : [];
    });

  return matches.length === 1 ? matches[0] : null;
}

function buildUniqueTierSelections(
  defaults: ProviderModelDefaults | undefined,
): Record<TierKey, TierModelSelection | null> {
  return {
    LOW: pickUniqueTierSelection(defaults, 'LOW'),
    MED: pickUniqueTierSelection(defaults, 'MED'),
    HIGH: pickUniqueTierSelection(defaults, 'HIGH'),
  };
}

export function ModelDefaultsPanel() {
  const [state, setState] = useState<ProviderDefaultsState | null>(null);
  const [modelGroups, setModelGroups] = useState<AvailableModelGroupIPC[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealthInfoIPC[]>([]);
  const [oauthProviderIds, setOauthProviderIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProviderId, setNewProviderId] = useState('');
  const saveNoticeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sero = getSero();
      const [defaults, onboarding, authProviders] = await Promise.all([
        sero.providerDefaults.get(),
        sero.onboarding.getState(),
        sero.auth.getProviders(),
      ]);
      setState(defaults);
      setModelGroups(onboarding.availableModelGroups);
      setProviderHealth(onboarding.providerHealth);
      setOauthProviderIds(authProviders.oauth.map((provider) => provider.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (saveNoticeTimerRef.current) {
        clearTimeout(saveNoticeTimerRef.current);
      }
    };
  }, []);

  const providerHealthById = useMemo(
    () => new Map(providerHealth.map((entry) => [entry.providerId, entry] as const)),
    [providerHealth],
  );

  const modelGroupsById = useMemo(
    () => new Map(modelGroups.map((entry) => [entry.provider, entry] as const)),
    [modelGroups],
  );

  const getDisplayName = useCallback((providerId: string): string => {
    return providerHealthById.get(providerId)?.displayName
      ?? modelGroupsById.get(providerId)?.displayName
      ?? providerId;
  }, [modelGroupsById, providerHealthById]);

  const providerIds = useMemo(() => {
    const ids = new Set<string>([
      ...Object.keys(state?.builtInDefaults ?? {}),
      ...Object.keys(state?.globalDefaults ?? {}),
      ...Object.keys(state?.effectiveDefaults ?? {}),
      ...modelGroups.map((group) => group.provider),
      ...providerHealth.map((entry) => entry.providerId),
    ]);

    return [...ids].sort(
      (a, b) => getDisplayName(a).localeCompare(getDisplayName(b)) || a.localeCompare(b),
    );
  }, [getDisplayName, modelGroups, providerHealth, state]);

  const getProviderHealth = useCallback((providerId: string): ProviderHealthInfoIPC => {
    const exact = providerHealthById.get(providerId);
    if (exact) return exact;

    const group = modelGroupsById.get(providerId);
    const usableModelIds = group?.models.map((model) => model.modelId) ?? [];
    if (usableModelIds.length > 0) {
      return {
        providerId,
        displayName: getDisplayName(providerId),
        status: 'unknown',
        message: 'Usable models are available.',
        canReconnect: false,
        hasUsableModels: true,
        usableModelIds,
      };
    }

    return {
      providerId,
      displayName: getDisplayName(providerId),
      status: 'missing',
      message: 'Not connected yet.',
      canReconnect: false,
      hasUsableModels: false,
      usableModelIds: [],
    };
  }, [getDisplayName, modelGroupsById, providerHealthById]);

  const canAuthenticateProvider = useCallback((providerId: string): boolean => {
    return oauthProviderIds.includes(providerId);
  }, [oauthProviderIds]);

  const saveDefaults = useCallback(async (nextDefaults: ProviderModelDefaults) => {
    setError(null);

    try {
      await getSero().providerDefaults.setGlobalDefaults(nextDefaults);
      setSaveNotice('Saved');
      if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
      saveNoticeTimerRef.current = globalThis.setTimeout(() => setSaveNotice(null), 1500);
      const fresh = await getSero().providerDefaults.get();
      setState(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  }, []);

  const handleQuickPickChange = useCallback((tier: TierKey, selection: TierModelSelection) => {
    if (!state) return;

    const next: ProviderModelDefaults = {};
    for (const [providerId, tiers] of Object.entries(state.globalDefaults)) {
      if (providerId === selection.providerId) {
        next[providerId] = { ...tiers, [tier]: selection.modelId };
        continue;
      }

      const { [tier]: _removed, ...rest } = tiers;
      if (Object.keys(rest).length > 0) next[providerId] = rest;
    }

    if (!next[selection.providerId]) {
      next[selection.providerId] = { [tier]: selection.modelId };
    }

    void saveDefaults(next);
  }, [saveDefaults, state]);

  const handleProviderTierChange = useCallback((
    providerId: string,
    tier: TierKey,
    selection: TierModelSelection,
  ) => {
    if (!state) return;

    const next: ProviderModelDefaults = { ...state.globalDefaults };
    next[providerId] = {
      ...(next[providerId] ?? {}),
      [tier]: selection.modelId,
    };
    void saveDefaults(next);
  }, [saveDefaults, state]);

  const handleResetProvider = useCallback((providerId: string) => {
    if (!state) return;

    const { [providerId]: _removed, ...rest } = state.globalDefaults;
    void saveDefaults(rest);
  }, [saveDefaults, state]);

  const handleReconnect = useCallback(async (providerId: string) => {
    try {
      await getSero().auth.login(providerId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    }
  }, [load]);

  const handleAddProvider = useCallback(() => {
    const providerId = newProviderId.trim();
    if (!providerId || !state) return;

    const next: ProviderModelDefaults = {
      ...state.globalDefaults,
      [providerId]: state.globalDefaults[providerId] ?? {},
    };
    void saveDefaults(next);
    setNewProviderId('');
    setAddingProvider(false);
  }, [newProviderId, saveDefaults, state]);

  const quickPickSelections = useMemo(
    () => state ? buildUniqueTierSelections(state.globalDefaults) : EMPTY_TIER_SELECTIONS,
    [state],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading providers…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Providers</h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Quick picks set one preferred model per tier. Provider cards below manage exact
              per-provider fallbacks and connection status.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveNotice && (
              <span className="admin-fade-in text-[11px] text-primary">{saveNotice}</span>
            )}
            {error && (
              <span className="text-[11px] text-destructive">{error}</span>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">
          <div className="rounded-xl border border-border/40 bg-background/60 p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Tier Quick Picks
            </p>
            <p className="mb-3 text-[11px] text-muted-foreground/60">
              Selecting a model here updates the provider that owns that model and clears the same
              tier from the other provider overrides. If multiple providers already override the
              same tier, the quick pick stays blank until you choose one here.
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {TIERS.map((tier) => {
                const value = quickPickSelections[tier];
                return (
                  <div key={tier} className="space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {tier}
                    </span>
                    <TierModelPicker
                      value={value}
                      providerFilter={null}
                      placeholder="Select model"
                      showDefaultIndicator={false}
                      modelGroups={modelGroups}
                      onSelect={(selection) => handleQuickPickChange(tier, selection)}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Providers
            </p>
            <div className="space-y-2">
              {providerIds.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/40 px-4 py-8 text-center text-xs text-muted-foreground/60">
                  No providers available yet. Add a provider API key in Settings or authenticate
                  with a provider.
                </div>
              ) : (
                providerIds.map((providerId) => {
                  const health = getProviderHealth(providerId);
                  const effectiveHigh = state?.effectiveDefaults[providerId]?.HIGH ?? '';
                  return (
                    <ProviderCard
                      key={providerId}
                      providerId={providerId}
                      displayName={getDisplayName(providerId)}
                      defaultModel={effectiveHigh}
                      health={health.status}
                      healthMessage={
                        health.status === 'healthy' || health.status === 'env' || health.status === 'local'
                          ? undefined
                          : health.message
                      }
                      canReconnect={canAuthenticateProvider(providerId) && (
                        health.status === 'missing' || health.status === 'broken_expired'
                      )}
                      overrides={state?.globalDefaults[providerId] ?? {}}
                      builtInDefaults={state?.builtInDefaults[providerId] ?? {}}
                      modelGroups={modelGroups}
                      onTierChange={handleProviderTierChange}
                      onReset={handleResetProvider}
                      onReconnect={handleReconnect}
                    />
                  );
                })
              )}
            </div>

            {addingProvider ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/40 bg-background/60 px-4 py-3">
                <Input
                  value={newProviderId}
                  onChange={(event) => setNewProviderId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAddProvider();
                    if (event.key === 'Escape') setAddingProvider(false);
                  }}
                  placeholder="Provider ID…"
                  className="h-7 flex-1 text-xs"
                  autoFocus
                />
                <Button
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={handleAddProvider}
                  disabled={!newProviderId.trim()}
                >
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setAddingProvider(false);
                    setNewProviderId('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setAddingProvider(true)}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/40 py-2.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
              >
                <span>+</span> Add provider
              </button>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
