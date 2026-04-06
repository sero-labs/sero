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
      ? modelGroups.filter((g) =>
          g.provider === providerFilter || g.provider.startsWith(providerFilter + '-'),
        )
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
