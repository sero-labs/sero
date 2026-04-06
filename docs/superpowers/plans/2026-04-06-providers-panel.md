# Providers Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ModelDefaultsPanel with a two-section Providers panel — global tier selectors at top, provider cards with health status below.

**Architecture:** Global tiers use Popover-based model pickers that can select any model from any provider. Provider cards show health/auth status with collapse/expand for per-provider tier overrides. A shared `TierModelPicker` component is used by both. New IPC bridges for `models.list()` and `auth.getProviders()`/`auth.login()` are added to `SeroApi`.

**Tech Stack:** React 19, Tailwind 4, shadcn/ui Popover, existing `providerDefaults` IPC

**Spec:** `docs/superpowers/specs/2026-04-06-providers-panel-design.md`

---

## File Structure

### Files to create (in `plugins/sero-admin-plugin/ui/`)
| File | Responsibility |
|------|---------------|
| `components/TierModelPicker.tsx` | Popover-based model picker for a single tier — search, grouped models, custom ID fallback |
| `components/ProviderCard.tsx` | Collapsible provider card with health badge, default model, per-provider tier overrides |

### Files to modify
| File | Changes |
|------|---------|
| `hooks/useSeroFiles.ts` | Add `models` and `auth` bridges to `SeroApi` |
| `components/ModelDefaultsPanel.tsx` | Full rewrite — global tiers section + provider cards |
| `components/NavSidebar.tsx` | Rename "Defaults" → "Providers" |
| `components/Header.tsx` | Rename "Model Defaults" → "Providers" |

---

### Task 1: Extend SeroApi with models and auth IPC bridges

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts`

- [ ] **Step 1: Add model and auth types after the existing resource IPC types**

After the `PromptTemplateFileDataIPC` interface (around line 145), add:

```typescript
// ── Model / auth IPC types ────────────────────────────────

export interface ModelInfoIPC {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
}

export interface AvailableModelGroupIPC {
  provider: string;
  displayName: string;
  logo: string;
  models: ModelInfoIPC[];
}

export interface OAuthProviderInfoIPC {
  id: string;
  name: string;
  isLoggedIn: boolean;
  canRefresh: boolean;
}

export interface ApiKeyProviderInfoIPC {
  id: string;
  name: string;
  hasKey: boolean;
  fromEnv: boolean;
}

export interface AuthProvidersResponseIPC {
  oauth: OAuthProviderInfoIPC[];
  apiKey: ApiKeyProviderInfoIPC[];
}
```

- [ ] **Step 2: Add models and auth blocks to the SeroApi interface**

Inside the `SeroApi` interface, add after the `providerDefaults` block:

```typescript
  models: {
    list(): Promise<AvailableModelGroupIPC[]>;
  };
  auth: {
    getProviders(): Promise<AuthProvidersResponseIPC>;
    login(providerId: string): Promise<void>;
  };
```

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts
git commit -m "feat(admin): add models.list() and auth IPC bridges to SeroApi"
```

---

### Task 2: Create TierModelPicker component

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/TierModelPicker.tsx`

- [ ] **Step 1: Create the Popover-based model picker**

```typescript
/**
 * TierModelPicker — Popover-based model selector for a single tier.
 *
 * Shows a trigger button with the current model name. Opens a searchable
 * popover listing available models grouped by provider. Supports custom
 * model ID entry for models not in the known list.
 */

import { useState, useMemo, useCallback, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AvailableModelGroupIPC, ModelInfoIPC } from '../hooks/useSeroFiles';

interface TierModelPickerProps {
  /** Currently selected model ID (empty string = using default). */
  value: string;
  /** Provider filter — if set, only show models from this provider. Null = all providers. */
  providerFilter: string | null;
  /** Placeholder text when no value is set (e.g. "claude-sonnet-4-6"). */
  placeholder: string;
  /** Provider label shown below model name in the trigger. */
  providerLabel?: string;
  /** Available model groups. */
  modelGroups: AvailableModelGroupIPC[];
  /** Called when user selects a model. */
  onSelect: (modelId: string) => void;
}

export function TierModelPicker({
  value,
  providerFilter,
  placeholder,
  providerLabel,
  modelGroups,
  onSelect,
}: TierModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => {
    let filtered = providerFilter
      ? modelGroups.filter((g) => g.provider === providerFilter)
      : modelGroups;

    if (filter) {
      const q = filter.toLowerCase();
      filtered = filtered
        .map((g) => ({
          ...g,
          models: g.models.filter(
            (m) => m.name.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.models.length > 0);
    }

    return filtered;
  }, [modelGroups, providerFilter, filter]);

  const totalModels = useMemo(
    () => groups.reduce((n, g) => n + g.models.length, 0),
    [groups],
  );

  // Derive display label for the trigger
  const displayModel = useMemo(() => {
    if (!value) return null;
    for (const g of modelGroups) {
      const m = g.models.find((m) => m.modelId === value);
      if (m) return { name: m.name, provider: g.displayName };
    }
    return { name: value, provider: providerLabel ?? '' };
  }, [value, modelGroups, providerLabel]);

  const handleSelect = useCallback((modelId: string) => {
    onSelect(modelId);
    setOpen(false);
    setFilter('');
    setCustomMode(false);
  }, [onSelect]);

  const handleCustomSubmit = useCallback(() => {
    const trimmed = customValue.trim();
    if (trimmed) {
      handleSelect(trimmed);
      setCustomValue('');
    }
  }, [customValue, handleSelect]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setFilter('');
      setCustomMode(false);
      setCustomValue('');
    }
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex w-full flex-col items-start gap-0.5 rounded-md border border-input px-2.5 py-1.5 text-left transition-colors',
            'hover:bg-secondary/50',
            open && 'ring-1 ring-ring',
          )}
        >
          <span className={cn(
            'truncate text-xs',
            value ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}>
            {displayModel?.name ?? placeholder}
            {!value && ' (default)'}
          </span>
          {(displayModel?.provider || (!value && providerLabel)) && (
            <span className="truncate text-[10px] text-muted-foreground/60">
              {displayModel?.provider ?? providerLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[260px] overflow-hidden rounded-xl border-border/50 bg-background p-0 shadow-xl"
      >
        {customMode ? (
          /* Custom model ID input */
          <div className="p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
              <input
                ref={inputRef}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSubmit(); if (e.key === 'Escape') setCustomMode(false); }}
                placeholder="Enter model ID…"
                className="h-8 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
            </div>
            <div className="mt-1.5 flex justify-end gap-1">
              <button
                onClick={() => setCustomMode(false)}
                className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomSubmit}
                disabled={!customValue.trim()}
                className="rounded bg-primary px-2 py-1 text-[10px] text-primary-foreground disabled:opacity-40"
              >
                Confirm
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-border/30 px-3">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search models…"
                className="h-8 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
            </div>

            {/* Model list */}
            <div className="max-h-[280px] overflow-y-auto py-1">
              {totalModels === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {filter ? 'No models match' : 'No models available'}
                </p>
              ) : (
                groups.map((group, i) => (
                  <div key={group.provider}>
                    {i > 0 && <div className="mx-3 my-0.5 border-t border-border/20" />}
                    {!providerFilter && (
                      <div className="flex items-center gap-2 px-3 pb-0.5 pt-2">
                        <img
                          src={group.logo}
                          alt={group.displayName}
                          className="size-3 rounded-sm dark:invert"
                        />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {group.displayName}
                        </span>
                      </div>
                    )}
                    <div className="px-1">
                      {group.models.map((model) => (
                        <ModelItem
                          key={`${model.provider}/${model.modelId}`}
                          model={model}
                          isSelected={value === model.modelId}
                          onSelect={() => handleSelect(model.modelId)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Custom model ID footer */}
            <div className="border-t border-border/30">
              <button
                onClick={() => { setCustomMode(true); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Custom model ID…
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Model item ────────────────────────────────────────────────

function ModelItem({ model, isSelected, onSelect }: {
  model: ModelInfoIPC;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
        isSelected
          ? 'bg-primary/8 text-foreground'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
      )}
    >
      <div className="flex size-3.5 shrink-0 items-center justify-center">
        {isSelected ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <div className="size-1.5 rounded-full bg-border" />
        )}
      </div>
      <span className="flex-1 truncate font-medium">{model.name}</span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/TierModelPicker.tsx
git commit -m "feat(admin): add TierModelPicker — Popover-based model selector for tiers"
```

---

### Task 3: Create ProviderCard component

**Files:**
- Create: `plugins/sero-admin-plugin/ui/components/ProviderCard.tsx`

- [ ] **Step 1: Create the collapsible provider card with health badge**

```typescript
/**
 * ProviderCard — collapsible card showing provider health, default model,
 * and optional per-provider tier overrides.
 */

import { useState, useCallback } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { TierModelPicker } from './TierModelPicker';
import type { AvailableModelGroupIPC } from '../hooks/useSeroFiles';

type TierKey = 'LOW' | 'MED' | 'HIGH';
const TIERS: readonly TierKey[] = ['LOW', 'MED', 'HIGH'] as const;

type HealthStatus = 'healthy' | 'expired' | 'invalid' | 'missing' | 'unknown';

interface ProviderCardProps {
  providerId: string;
  displayName: string;
  /** Effective HIGH-tier model (the representative default). */
  defaultModel: string;
  health: HealthStatus;
  healthMessage?: string;
  canReconnect: boolean;
  /** Current per-provider tier overrides (may be empty). */
  overrides: Partial<Record<TierKey, string>>;
  /** Built-in default models for this provider. */
  builtInDefaults: Partial<Record<TierKey, string>>;
  /** Available models for this provider (for the tier pickers). */
  modelGroups: AvailableModelGroupIPC[];
  onTierChange: (providerId: string, tier: TierKey, modelId: string) => void;
  onReset: (providerId: string) => void;
  onReconnect: (providerId: string) => void;
}

const HEALTH_DISPLAY: Record<HealthStatus, { dot: string; label: string; color: string }> = {
  healthy: { dot: '●', label: 'healthy', color: 'text-emerald-400' },
  expired: { dot: '⚠', label: 'expired', color: 'text-amber-400' },
  invalid: { dot: '⚠', label: 'invalid', color: 'text-amber-400' },
  missing: { dot: '○', label: 'not configured', color: 'text-muted-foreground' },
  unknown: { dot: '○', label: 'unknown', color: 'text-muted-foreground' },
};

export function ProviderCard({
  providerId,
  displayName,
  defaultModel,
  health,
  healthMessage,
  canReconnect,
  overrides,
  builtInDefaults,
  modelGroups,
  onTierChange,
  onReset,
  onReconnect,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasOverrides = Object.values(overrides).some((v) => v && v.length > 0);
  const healthInfo = HEALTH_DISPLAY[health];
  const isUnhealthy = health !== 'healthy';

  const handleTierChange = useCallback((tier: TierKey, modelId: string) => {
    onTierChange(providerId, tier, modelId);
  }, [providerId, onTierChange]);

  return (
    <div className="rounded-xl border border-border/40 bg-background/60 transition-colors">
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{displayName}</span>
            <span className={cn('text-[10px]', healthInfo.color)}>
              {healthInfo.dot} {healthInfo.label}
            </span>
            {hasOverrides && (
              <span className="rounded bg-primary/10 px-1.5 py-px text-[9px] font-medium text-primary">
                overridden
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isUnhealthy
              ? (healthMessage ?? `Provider ${health}`)
              : defaultModel || 'No models available'}
          </p>
        </div>

        {/* Re-authenticate action for unhealthy providers */}
        {isUnhealthy && canReconnect && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 border-amber-500/30 px-2 text-[10px] text-amber-400 hover:bg-amber-500/10"
            onClick={(e) => { e.stopPropagation(); onReconnect(providerId); }}
          >
            Re-authenticate
          </Button>
        )}

        {/* Chevron */}
        <span className={cn(
          'shrink-0 text-xs text-muted-foreground transition-transform duration-150',
          expanded && 'rotate-90',
        )}>
          ▸
        </span>
      </button>

      {/* Expanded — per-provider tier overrides */}
      {expanded && (
        <div className="border-t border-border/30 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-3">
            {TIERS.map((tier) => (
              <div key={tier} className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {tier}
                </span>
                <TierModelPicker
                  value={overrides[tier] ?? ''}
                  providerFilter={providerId}
                  placeholder={builtInDefaults[tier] ?? 'model-id'}
                  modelGroups={modelGroups}
                  onSelect={(modelId) => handleTierChange(tier, modelId)}
                />
                <p className="text-[10px] text-muted-foreground/50">
                  default: {builtInDefaults[tier] ?? '—'}
                </p>
              </div>
            ))}
          </div>

          {hasOverrides && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => onReset(providerId)}
                className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset to defaults
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/ProviderCard.tsx
git commit -m "feat(admin): add ProviderCard with health badge and per-provider tier overrides"
```

---

### Task 4: Rewrite ModelDefaultsPanel

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/components/ModelDefaultsPanel.tsx`

- [ ] **Step 1: Replace the entire file with the new Providers panel**

```typescript
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
    const ids = new Set<string>([
      ...Object.keys(state?.builtInDefaults ?? {}),
      ...Object.keys(state?.globalDefaults ?? {}),
      ...Object.keys(state?.effectiveDefaults ?? {}),
    ]);
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [state]);

  // ── Provider health mapping ───────────────────────────────

  const getProviderHealth = useCallback((providerId: string): ProviderHealth => {
    if (!authProviders) return { status: 'unknown', canReconnect: false };

    const oauth = authProviders.oauth.find((p) => p.id === providerId);
    if (oauth) {
      if (oauth.isLoggedIn) return { status: 'healthy', canReconnect: false };
      return {
        status: 'expired',
        message: 'Token expired or revoked',
        canReconnect: true,
      };
    }

    const apiKey = authProviders.apiKey.find((p) => p.id === providerId);
    if (apiKey) {
      if (apiKey.hasKey) return { status: 'healthy', canReconnect: false };
      return {
        status: 'missing',
        message: 'No API key configured',
        canReconnect: false,
      };
    }

    return { status: 'unknown', canReconnect: false };
  }, [authProviders]);

  // ── Provider display name ─────────────────────────────────

  const getDisplayName = useCallback((providerId: string): string => {
    const group = modelGroups.find((g) => g.provider === providerId);
    if (group) return group.displayName;
    const oauth = authProviders?.oauth.find((p) => p.id === providerId);
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
    // For global tiers, we store under a special '__global' key
    // or update the effective defaults directly. The existing IPC
    // uses per-provider defaults, so we set the model on the
    // appropriate provider's tier.
    if (!targetProvider) {
      // Custom model ID — can't determine provider, skip
      return;
    }
    const next: ProviderModelDefaults = { ...state.globalDefaults };
    if (!next[targetProvider]) next[targetProvider] = {};
    next[targetProvider] = { ...next[targetProvider], [tier]: modelId };
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

  // ── Loading ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="admin-loading text-xs text-muted-foreground">Loading providers…</div>
      </div>
    );
  }

  // ── Effective global tier values (from effective defaults) ─

  const globalTierValues = useMemo(() => {
    if (!state) return { LOW: '', MED: '', HIGH: '' };
    // Find the effective model for each tier across all providers
    // Use the first provider that has an effective value for each tier
    const result: Record<TierKey, string> = { LOW: '', MED: '', HIGH: '' };
    for (const tier of TIERS) {
      for (const providerId of providerIds) {
        const val = state.effectiveDefaults[providerId]?.[tier];
        if (val) { result[tier] = val; break; }
      }
    }
    return result;
  }, [state, providerIds]);

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
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm --filter @sero-ai/plugin-admin typecheck
```

Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/ModelDefaultsPanel.tsx
git commit -m "$(cat <<'EOF'
feat(admin): rewrite ModelDefaultsPanel — global tiers + provider cards

Two-section layout:
- Global tier selectors (LOW/MED/HIGH) pick any model from any provider
- Provider cards show health status with optional per-provider overrides
- Popover-based model pickers replace raw text inputs
- Auto-save on selection with inline feedback
EOF
)"
```

---

### Task 5: Rename Defaults → Providers in nav and header

**Files:**
- Modify: `plugins/sero-admin-plugin/ui/components/NavSidebar.tsx`
- Modify: `plugins/sero-admin-plugin/ui/components/Header.tsx`

- [ ] **Step 1: Update NavSidebar label**

In `NavSidebar.tsx`, find the nav item `{ id: 'modelDefaults', label: 'Defaults' }` and change the label:

```typescript
{ id: 'modelDefaults', label: 'Providers' },
```

- [ ] **Step 2: Update Header section label**

In `Header.tsx`, find `modelDefaults: 'Model Defaults'` in the `SECTION_LABELS` record and change:

```typescript
modelDefaults: 'Providers',
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm --filter @sero-ai/plugin-admin typecheck
```

- [ ] **Step 4: Commit**

```bash
git add plugins/sero-admin-plugin/ui/components/NavSidebar.tsx plugins/sero-admin-plugin/ui/components/Header.tsx
git commit -m "refactor(admin): rename Defaults → Providers in nav sidebar and header"
```

---

### Task 6: Build and verify

- [ ] **Step 1: Build the admin plugin**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm --filter @sero-ai/plugin-admin build
```

Expected: Build completes without errors.

- [ ] **Step 2: Build full monorepo**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero && pnpm build
```

Expected: All packages build without errors.

- [ ] **Step 3: Manual smoke test**

```bash
cd /Users/danielcarter/Documents/Dev/projects/sero/sero/apps/desktop && bash scripts/dev.sh
```

Verify:
1. Nav sidebar shows "Providers" instead of "Defaults"
2. Header shows "Providers" when selected
3. Global tiers section appears at top with 3 model pickers
4. Provider cards show below with health badges
5. Clicking a tier picker opens the Popover with searchable model list
6. Selecting a model auto-saves (brief "Saved" feedback)
7. Expanding a provider card shows per-provider tier overrides
8. Unhealthy providers show warning badge and "Re-authenticate" button
9. "Add provider" works
