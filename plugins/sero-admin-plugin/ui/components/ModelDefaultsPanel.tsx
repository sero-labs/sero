/**
 * ModelDefaultsPanel — Providers panel with global tier selectors and
 * provider cards showing health status.
 *
 * Two sections:
 *  1. Global tiers (LOW/MED/HIGH) — pick any model from any provider
 *  2. Provider list — health status, default model, per-provider overrides
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Input } from '@sero-ai/ui/components/ui/input';
import { getSero, type ProviderDefaultsState, type ProviderModelDefaults, type AvailableModelGroupIPC, type AuthProvidersResponseIPC } from '../hooks/useSeroFiles';
import { TierModelPicker } from './TierModelPicker';
import { ProviderCard } from './ProviderCard';

type TierKey = 'LOW' | 'MED' | 'HIGH';
const TIERS: readonly TierKey[] = ['LOW', 'MED', 'HIGH'] as const;

type HealthStatus = 'healthy' | 'expired' | 'invalid' | 'missing' | 'unknown';

interface ProviderHealth {
  status: HealthStatus;
  message?: string;
  canReconnect: boolean;
}

export function ModelDefaultsPanel() {
  const [state, setState] = useState<ProviderDefaultsState | null>(null);
  const [modelGroups, setModelGroups] = useState<AvailableModelGroupIPC[]>([]);
  const [authProviders, setAuthProviders] = useState<AuthProvidersResponseIPC | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState(false);
  const [newProviderId, setNewProviderId] = useState('');
  const saveNoticeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  // ── Load all data ─────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sero = getSero();
      const [defaults, models, auth] = await Promise.all([
        sero.providerDefaults.get(),
        sero.models.list(),
        sero.auth.getProviders(),
      ]);
      setState(defaults);
      setModelGroups(models);
      setAuthProviders(auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Provider list ─────────────────────────────────────────

  const providerIds = useMemo(() => {
    const raw = new Set<string>([
      ...Object.keys(state?.builtInDefaults ?? {}),
      ...Object.keys(state?.globalDefaults ?? {}),
      ...Object.keys(state?.effectiveDefaults ?? {}),
    ]);
    // Deduplicate: if both 'openai' and 'openai-codex' exist, keep only the
    // base ID — prefix matching in health/display/tier picker handles the rest.
    const sorted = [...raw].sort((a, b) => a.localeCompare(b));
    return sorted.filter((id) =>
      !sorted.some((other) => other !== id && id.startsWith(other + '-')),
    );
  }, [state]);

  // ── Provider health mapping ───────────────────────────────

  // Provider IDs in defaults (e.g. 'openai') may differ from models.list()
  // (e.g. 'openai-codex') and auth (e.g. 'openai-codex'). Use prefix matching:
  // 'openai' matches 'openai-codex', 'google' matches 'google-gemini-cli'.
  const matchesProvider = useCallback((groupId: string, defaultsId: string): boolean => {
    return groupId === defaultsId || groupId.startsWith(defaultsId + '-');
  }, []);

  const getProviderHealth = useCallback((providerId: string): ProviderHealth => {
    // If models.list() returned models for this provider (prefix match), it's usable
    const hasModels = modelGroups.some(
      (g) => matchesProvider(g.provider, providerId) && g.models.length > 0,
    );
    if (hasModels) return { status: 'healthy', canReconnect: false };

    if (!authProviders) return { status: 'unknown', canReconnect: false };

    // Check OAuth providers with prefix match
    const oauth = authProviders.oauth.find(
      (p) => p.id === providerId || p.id.startsWith(providerId + '-'),
    );
    if (oauth) {
      if (oauth.isLoggedIn) return { status: 'healthy', canReconnect: false };
      return {
        status: 'expired',
        message: 'Token expired or revoked',
        canReconnect: true,
      };
    }

    // Check API key providers
    const apiKey = authProviders.apiKey.find((p) => p.id === providerId);
    if (apiKey) {
      if (apiKey.hasKey) return { status: 'healthy', canReconnect: false };
      return {
        status: 'missing',
        message: 'No API key configured',
        canReconnect: false,
      };
    }

    return { status: 'missing', message: 'No API key configured', canReconnect: false };
  }, [authProviders, modelGroups, matchesProvider]);

  // ── Provider display name ─────────────────────────────────

  const getDisplayName = useCallback((providerId: string): string => {
    const group = modelGroups.find((g) => matchesProvider(g.provider, providerId));
    if (group) return group.displayName;
    const oauth = authProviders?.oauth.find(
      (p) => p.id === providerId || p.id.startsWith(providerId + '-'),
    );
    if (oauth) return oauth.name;
    const apiKey = authProviders?.apiKey.find((p) => p.id === providerId);
    if (apiKey) return apiKey.name;
    return providerId;
  }, [modelGroups, authProviders]);

  // ── Save with feedback ────────────────────────────────────

  const saveDefaults = useCallback(async (nextDefaults: ProviderModelDefaults) => {
    setError(null);
    try {
      await getSero().providerDefaults.setGlobalDefaults(nextDefaults);
      setSaveNotice('Saved');
      if (saveNoticeTimerRef.current) clearTimeout(saveNoticeTimerRef.current);
      saveNoticeTimerRef.current = globalThis.setTimeout(() => setSaveNotice(null), 1500);
      // Reload to get fresh effective values
      const fresh = await getSero().providerDefaults.get();
      setState(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  }, []);

  // ── Global tier change ────────────────────────────────────

  const handleGlobalTierChange = useCallback((tier: TierKey, modelId: string) => {
    if (!state) return;
    // Find which provider this model belongs to
    let targetProvider: string | null = null;
    for (const group of modelGroups) {
      if (group.models.some((m) => m.modelId === modelId)) {
        targetProvider = group.provider;
        break;
      }
    }
    if (!targetProvider) return;
    // Global tier = one model per tier across all providers.
    // Clear this tier from every other provider so the new value wins.
    const next: ProviderModelDefaults = {};
    for (const [pid, tiers] of Object.entries(state.globalDefaults)) {
      if (pid === targetProvider) {
        next[pid] = { ...tiers, [tier]: modelId };
      } else {
        const { [tier]: _removed, ...rest } = tiers;
        if (Object.keys(rest).length > 0) next[pid] = rest;
      }
    }
    if (!next[targetProvider]) next[targetProvider] = { [tier]: modelId };
    void saveDefaults(next);
  }, [state, modelGroups, saveDefaults]);

  // ── Per-provider tier change ──────────────────────────────

  const handleProviderTierChange = useCallback((providerId: string, tier: TierKey, modelId: string) => {
    if (!state) return;
    const next: ProviderModelDefaults = { ...state.globalDefaults };
    if (!next[providerId]) next[providerId] = {};
    next[providerId] = { ...next[providerId], [tier]: modelId };
    void saveDefaults(next);
  }, [state, saveDefaults]);

  // ── Reset provider ────────────────────────────────────────

  const handleResetProvider = useCallback((providerId: string) => {
    if (!state) return;
    const { [providerId]: _removed, ...rest } = state.globalDefaults;
    void saveDefaults(rest);
  }, [state, saveDefaults]);

  // ── Reconnect provider ────────────────────────────────────

  const handleReconnect = useCallback(async (providerId: string) => {
    try {
      await getSero().auth.login(providerId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    }
  }, [load]);

  // ── Add provider ──────────────────────────────────────────

  const handleAddProvider = useCallback(() => {
    const id = newProviderId.trim();
    if (!id || !state) return;
    const next: ProviderModelDefaults = {
      ...state.globalDefaults,
      [id]: state.globalDefaults[id] ?? {},
    };
    void saveDefaults(next);
    setNewProviderId('');
    setAddingProvider(false);
  }, [newProviderId, state, saveDefaults]);

  // ── Effective global tier values (from effective defaults) ─

  const globalTierValues = useMemo(() => {
    if (!state) return { LOW: '', MED: '', HIGH: '' };
    const result: Record<TierKey, string> = { LOW: '', MED: '', HIGH: '' };
    // All provider IDs from both user overrides and built-in defaults
    const allIds = new Set<string>([
      ...Object.keys(state.globalDefaults),
      ...Object.keys(state.effectiveDefaults),
    ]);
    for (const tier of TIERS) {
      // User's explicit overrides take priority
      for (const pid of allIds) {
        const val = state.globalDefaults[pid]?.[tier];
        if (val) { result[tier] = val; break; }
      }
      // Fall back to effective (built-in merged) if no user override
      if (!result[tier]) {
        for (const pid of allIds) {
          const val = state.effectiveDefaults[pid]?.[tier];
          if (val) { result[tier] = val; break; }
        }
      }
    }
    return result;
  }, [state]);

  // ── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading providers…</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/30 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Providers</h2>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Configure which models are used at each quality tier.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saveNotice && (
              <span className="text-[11px] text-primary admin-fade-in">{saveNotice}</span>
            )}
            {error && (
              <span className="text-[11px] text-destructive">{error}</span>
            )}
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-6 p-4">

          {/* ── Global Tiers ─────────────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-background/60 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Global Tiers
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {TIERS.map((tier) => (
                <div key={tier} className="space-y-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {tier}
                  </span>
                  <TierModelPicker
                    value={globalTierValues[tier]}
                    providerFilter={null}
                    placeholder={globalTierValues[tier] || 'Select model'}
                    modelGroups={modelGroups}
                    onSelect={(modelId) => handleGlobalTierChange(tier, modelId)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Provider List ────────────────────────────── */}
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Providers
            </p>
            <div className="space-y-2">
              {providerIds.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/40 px-4 py-8 text-center text-xs text-muted-foreground/60">
                  No providers available yet. Add a provider API key in Settings or authenticate with a provider.
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
                      healthMessage={health.message}
                      canReconnect={health.canReconnect}
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

            {/* Add provider */}
            {addingProvider ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/40 bg-background/60 px-4 py-3">
                <Input
                  value={newProviderId}
                  onChange={(e) => setNewProviderId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddProvider(); if (e.key === 'Escape') setAddingProvider(false); }}
                  placeholder="Provider ID…"
                  className="h-7 flex-1 text-xs"
                  autoFocus
                />
                <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleAddProvider} disabled={!newProviderId.trim()}>
                  Add
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setAddingProvider(false); setNewProviderId(''); }}>
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
