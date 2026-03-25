import { useState, useCallback, useMemo, useRef, useEffect, memo } from 'react';
// Note: useEffect is retained only for the idle-callback popover priming below.
import { ChevronDown, Check, Brain, Sparkles, Search, Settings2, Star } from 'lucide-react';
import { motion } from 'motion/react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { useAgentStore } from '@/stores/agent';
import { useFocusedModelState, useFocusedSessionId } from '@/stores/agent-selectors';
import { useModelPreferences, modelKey } from '@/stores/model-preferences';
import {
  THINKING_LEVELS,
  THINKING_LABELS,
  findModel,
  findGroup,
  type ThinkingLevel,
} from './model-config';
import { ModelManagerDialog } from './model-manager';
import type { ModelInfo, AvailableModelGroup } from '@/types/ipc';

// ── Trigger Button ─────────────────────────────────────────────

const ModelTrigger = memo(function ModelTrigger({
  disabled,
  onPrime,
}: {
  disabled: boolean;
  onPrime: () => void;
}) {
  const ms = useFocusedModelState();
  const groups = ms?.availableModels ?? [];

  const model = ms ? findModel(groups, ms.model.provider, ms.model.modelId) : null;
  const group = ms ? findGroup(groups, ms.model.provider, ms.model.modelId) : null;
  const label = model?.name ?? ms?.model.name ?? 'Select model';
  const thinking = ms?.thinkingLevel ?? 'off';

  return (
    <PopoverTrigger asChild disabled={disabled}>
      <button
        onFocus={onPrime}
        onMouseEnter={onPrime}
        className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs
          text-[var(--text-secondary)] transition-all duration-150
          hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]
          disabled:pointer-events-none disabled:opacity-40"
      >
        {group && (
          <img src={group.logo} alt={group.displayName}
            className="size-3.5 rounded-sm dark:invert" />
        )}
        <span className="max-w-[140px] truncate font-medium">{label}</span>
        {thinking !== 'off' && ms?.model.reasoning && (
          <span className="rounded-full bg-[var(--status-warning-subtle)] px-1.5 py-px text-[10px] font-semibold text-[var(--status-warning)]">
            {THINKING_LABELS[thinking] ?? thinking}
          </span>
        )}
        <ChevronDown className="size-3 text-[var(--text-muted)] transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </button>
    </PopoverTrigger>
  );
});

// ── Thinking Level Picker ──────────────────────────────────────

function ThinkingPicker({
  current, available, supportsXhigh, disabled, onSelect,
}: {
  current: string; available: string[]; supportsXhigh: boolean;
  disabled: boolean; onSelect: (level: string) => void;
}) {
  // When disabled, show the full set so the layout stays stable
  const levels = disabled
    ? THINKING_LEVELS
    : THINKING_LEVELS.filter(
        (l) => l === 'off' || available.includes(l) || (l === 'xhigh' && supportsXhigh),
      );
  const activeIdx = levels.indexOf((disabled ? 'off' : current) as ThinkingLevel);

  return (
    <div className={`flex flex-col gap-1.5 border-t border-[var(--border-subtle)] px-3 py-2.5 transition-opacity duration-150 ${
      disabled ? 'opacity-35 pointer-events-none' : ''
    }`}>
      <div className="flex items-center gap-1.5">
        <Brain className="size-3 text-[var(--text-muted)]" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Thinking
        </span>
      </div>
      <div className="relative flex rounded-lg bg-[var(--bg-base)] p-0.5">
        <motion.div
          className="absolute inset-y-0.5 rounded-md"
          initial={false}
          animate={{
            x: `${activeIdx * 100}%`,
            width: `${100 / levels.length}%`,
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          style={{
            background: disabled || current === 'off' ? 'var(--bg-elevated)'
              : current === 'xhigh' ? 'linear-gradient(135deg, #f59e0b33, #ef444433)'
              : 'linear-gradient(135deg, #6366f133, #8b5cf633)',
          }}
        />
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => onSelect(level)}
            className={`relative z-10 flex-1 rounded-md px-1 py-1 text-[11px] font-medium transition-colors duration-150 ${
              current === level && !disabled
                ? level === 'xhigh' ? 'text-[var(--status-warning)]'
                  : level === 'off' ? 'text-[var(--text-secondary)]'
                  : 'text-[var(--banner-primary)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {THINKING_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Model Item ─────────────────────────────────────────────────

const ModelItem = memo(function ModelItem({ model, isSelected, isFavourite, onSelect }: {
  model: ModelInfo; isSelected: boolean; isFavourite: boolean; onSelect: (model: ModelInfo) => void;
}) {
  return (
    <button
      onClick={() => onSelect(model)}
      className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 active:scale-[0.98] ${
        isSelected
          ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-primary)]'
      }`}
    >
      <div className="flex size-4 shrink-0 items-center justify-center">
        {isSelected ? (
          <Check className="size-3.5 text-[var(--status-success)] transition-transform duration-150 scale-100" />
        ) : isFavourite ? (
          <Star className="size-3 text-amber-400" fill="currentColor" />
        ) : (
          <div className="size-1.5 rounded-full bg-[var(--border-default)] transition-colors group-hover:bg-[var(--text-muted)]" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate text-xs font-medium">{model.name}</span>
        {model.reasoning && <Sparkles className="size-3 shrink-0 text-[var(--status-warning)]/60" />}
      </div>
    </button>
  );
});

// ── Provider Group ─────────────────────────────────────────────

const ProviderSection = memo(function ProviderSection({ group, selectedProvider, selectedModelId, favouriteKeys, onSelect }: {
  group: AvailableModelGroup;
  selectedProvider: string | null;
  selectedModelId: string | null;
  favouriteKeys: Set<string>;
  onSelect: (model: ModelInfo) => void;
}) {
  return (
    <div className="py-1">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
        <img src={group.logo} alt={group.displayName}
          className="size-3.5 rounded-sm dark:invert" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          {group.displayName}
        </span>
      </div>
      <div className="px-1">
        {group.models.map((model) => (
          <ModelItem
            key={`${model.provider}/${model.modelId}`}
            model={model}
            isSelected={
              selectedProvider === model.provider &&
              selectedModelId === model.modelId
            }
            isFavourite={favouriteKeys.has(modelKey(model.provider, model.modelId))}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
});

// ── Helpers ────────────────────────────────────────────────────

/** Filter groups by search query, matching on model name or model ID. */
function filterGroups(groups: AvailableModelGroup[], query: string): AvailableModelGroup[] {
  if (!query) return groups;
  const q = query.toLowerCase();
  const filtered: AvailableModelGroup[] = [];
  for (const group of groups) {
    const matches = group.models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q),
    );
    if (matches.length) filtered.push({ ...group, models: matches });
  }
  return filtered;
}

/** Remove hidden models/providers and extract favourite models into a separate section. */
function applyPreferences(
  groups: AvailableModelGroup[],
  hiddenModels: Set<string>,
  hiddenProviders: Set<string>,
): AvailableModelGroup[] {
  const result: AvailableModelGroup[] = [];
  for (const group of groups) {
    if (hiddenProviders.has(group.provider)) continue;
    const visible = group.models.filter(
      (m) => !hiddenModels.has(modelKey(m.provider, m.modelId)),
    );
    if (visible.length) result.push({ ...group, models: visible });
  }
  return result;
}

/** Build a favourites section from groups + favourite keys. */
function buildFavourites(
  groups: AvailableModelGroup[],
  favouriteKeys: string[],
): { model: ModelInfo; group: AvailableModelGroup }[] {
  if (!favouriteKeys.length) return [];
  const favSet = new Set(favouriteKeys);
  const result: { model: ModelInfo; group: AvailableModelGroup }[] = [];
  for (const group of groups) {
    for (const model of group.models) {
      if (favSet.has(modelKey(model.provider, model.modelId))) {
        result.push({ model, group });
      }
    }
  }
  return result;
}

// ── Main Component ─────────────────────────────────────────────

export function ModelSelector({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [isPrimed, setIsPrimed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useFocusedSessionId();
  const ms = useFocusedModelState();
  const setModel = useAgentStore((s) => s.setModel);
  const setThinkingLevel = useAgentStore((s) => s.setThinkingLevel);

  const prefs = useModelPreferences();
  const favouriteKeys = useMemo(() => new Set(prefs.favouriteModels), [prefs.favouriteModels]);
  const hiddenModelKeys = useMemo(() => new Set(prefs.hiddenModels), [prefs.hiddenModels]);
  const hiddenProviderKeys = useMemo(() => new Set(prefs.hiddenProviders), [prefs.hiddenProviders]);

  const allGroups = ms?.availableModels ?? [];
  const selectedProvider = ms?.model.provider ?? null;
  const selectedModelId = ms?.model.modelId ?? null;

  // Apply visibility preferences then search filter
  const visibleGroups = useMemo(
    () => applyPreferences(allGroups, hiddenModelKeys, hiddenProviderKeys),
    [allGroups, hiddenModelKeys, hiddenProviderKeys],
  );
  const filteredGroups = useMemo(() => filterGroups(visibleGroups, filter), [visibleGroups, filter]);
  const totalFiltered = useMemo(
    () => filteredGroups.reduce((n, g) => n + g.models.length, 0),
    [filteredGroups],
  );

  // Build favourites section (only when not searching)
  const favourites = useMemo(
    () => filter ? [] : buildFavourites(visibleGroups, prefs.favouriteModels),
    [visibleGroups, prefs.favouriteModels, filter],
  );

  const primePopover = useCallback(() => {
    setIsPrimed(true);
  }, []);

  // Idle-callback popover priming — external browser API, useEffect is appropriate
  useEffect(() => {
    if (isPrimed) return;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const requestIdle = window.requestIdleCallback?.bind(window);
    if (requestIdle) {
      idleId = requestIdle(() => setIsPrimed(true), { timeout: 250 });
    } else {
      timeoutId = globalThis.setTimeout(() => setIsPrimed(true), 120);
    }
    return () => {
      if (idleId !== null) window.cancelIdleCallback(idleId);
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    };
  }, [isPrimed]);

  const handleModelSelect = useCallback(
    (model: ModelInfo) => {
      if (!sessionId) return;
      setModel(sessionId, model.provider, model.modelId);
    },
    [sessionId, setModel],
  );

  const handleThinkingSelect = useCallback(
    (level: string) => {
      if (!sessionId) return;
      setThinkingLevel(sessionId, level);
    },
    [sessionId, setThinkingLevel],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setIsPrimed(true);
      setFilter('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setOpen(nextOpen);
  }, []);

  const handleOpenManager = useCallback(() => {
    setOpen(false);
    setManagerOpen(true);
  }, []);

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <ModelTrigger disabled={disabled} onPrime={primePopover} />
        <PopoverContent
          forceMount={isPrimed ? true : undefined}
          side="top"
          align="start"
          sideOffset={8}
          className="w-[300px] overflow-hidden rounded-xl border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0 shadow-2xl shadow-black/40 duration-150 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100 data-[side=top]:slide-in-from-bottom-0 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0"
        >
          <div>

            {/* Search input + settings gear */}
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
              <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search models…"
                data-slot="model-filter"
                className="h-9 w-full bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus-visible:outline-none"
              />
              <button
                onClick={handleOpenManager}
                title="Manage models"
                className="shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors
                  hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
              >
                <Settings2 className="size-3.5" />
              </button>
            </div>

            {/* Model List */}
            <div className="max-h-[320px] overflow-y-auto py-1">
              {allGroups.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                  No models available. Run <code className="rounded bg-[var(--bg-muted)] px-1 font-mono">pi auth</code> to add a provider.
                </div>
              ) : totalFiltered === 0 && favourites.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                  No models matching "<span className="text-[var(--text-secondary)]">{filter}</span>"
                </div>
              ) : (
                <>
                  {/* Favourites section */}
                  {favourites.length > 0 && (
                    <div className="py-1">
                      <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                        <Star className="size-3 text-amber-400" fill="currentColor" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          Favourites
                        </span>
                      </div>
                      <div className="px-1">
                        {favourites.map(({ model }) => (
                          <ModelItem
                            key={`fav-${model.provider}/${model.modelId}`}
                            model={model}
                            isSelected={
                              selectedProvider === model.provider &&
                              selectedModelId === model.modelId
                            }
                            isFavourite
                            onSelect={handleModelSelect}
                          />
                        ))}
                      </div>
                      <div className="mx-3 mt-1 border-t border-[var(--border-subtle)]" />
                    </div>
                  )}

                  {/* Provider groups */}
                  {filteredGroups.map((group, i) => (
                    <div key={group.provider}>
                      {i > 0 && (
                        <div className="mx-3 border-t border-[var(--border-subtle)]" />
                      )}
                      <ProviderSection
                        group={group}
                        selectedProvider={selectedProvider}
                        selectedModelId={selectedModelId}
                        favouriteKeys={favouriteKeys}
                        onSelect={handleModelSelect}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Thinking Level Picker — always shown, disabled when model has no reasoning */}
            <ThinkingPicker
              current={ms?.thinkingLevel ?? 'off'}
              available={ms?.availableThinkingLevels ?? []}
              supportsXhigh={ms?.supportsXhigh ?? false}
              disabled={!ms?.model.reasoning}
              onSelect={handleThinkingSelect}
            />
          </div>
        </PopoverContent>
      </Popover>

      <ModelManagerDialog open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  );
}
