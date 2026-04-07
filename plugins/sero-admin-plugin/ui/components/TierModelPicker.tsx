/**
 * TierModelPicker — Popover-based model selector for a single tier.
 *
 * Shows a trigger button with the current model name. Opens a searchable
 * popover listing available models grouped by provider. Custom model IDs are
 * only supported when the picker is already scoped to a single provider.
 */

import { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AvailableModelGroupIPC, ModelInfoIPC } from '../hooks/useSeroFiles';

export interface TierModelSelection {
  providerId: string;
  modelId: string;
}

interface TierModelPickerProps {
  /** Currently selected model (null = using placeholder/default). */
  value: TierModelSelection | null;
  /** Provider filter — if set, only show models from this exact provider. */
  providerFilter: string | null;
  /** Placeholder text when no explicit value is set. */
  placeholder: string;
  /** Append "(default)" when no explicit value is set. Defaults to true. */
  showDefaultIndicator?: boolean;
  /** Provider label shown below the placeholder when no value is set. */
  providerLabel?: string;
  /** Available model groups. */
  modelGroups: AvailableModelGroupIPC[];
  /** Called when user selects a model. */
  onSelect: (selection: TierModelSelection) => void;
}

export function TierModelPicker({
  value,
  providerFilter,
  placeholder,
  showDefaultIndicator = true,
  providerLabel,
  modelGroups,
  onSelect,
}: TierModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');

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
  }, [filter, modelGroups, providerFilter]);

  const totalModels = useMemo(
    () => groups.reduce((count, group) => count + group.models.length, 0),
    [groups],
  );

  const scopedProviderLabel = useMemo(() => {
    if (providerLabel) return providerLabel;
    if (!providerFilter) return undefined;
    return modelGroups.find((group) => group.provider === providerFilter)?.displayName;
  }, [modelGroups, providerFilter, providerLabel]);

  const displayModel = useMemo(() => {
    if (!value) return null;

    const group = modelGroups.find((candidate) => candidate.provider === value.providerId);
    const model = group?.models.find((candidate) => candidate.modelId === value.modelId);
    if (model) {
      return {
        name: model.name,
        provider: group?.displayName ?? value.providerId,
      };
    }

    return {
      name: value.modelId,
      provider: scopedProviderLabel ?? value.providerId,
    };
  }, [modelGroups, scopedProviderLabel, value]);

  const handleSelect = useCallback((selection: TierModelSelection) => {
    onSelect(selection);
    setOpen(false);
    setFilter('');
    setCustomMode(false);
    setCustomValue('');
  }, [onSelect]);

  const handleCustomSubmit = useCallback(() => {
    const modelId = customValue.trim();
    if (!modelId || !providerFilter) return;

    handleSelect({ providerId: providerFilter, modelId });
  }, [customValue, handleSelect, providerFilter]);

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) return;

    setFilter('');
    setCustomMode(false);
    setCustomValue('');
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
          <span
            className={cn(
              'truncate text-xs',
              value ? 'font-medium text-foreground' : 'text-muted-foreground',
            )}
          >
            {displayModel?.name ?? placeholder}
            {!value && showDefaultIndicator && ' (default)'}
          </span>
          {(displayModel?.provider || (!value && scopedProviderLabel)) && (
            <span className="truncate text-[10px] text-muted-foreground/60">
              {displayModel?.provider ?? scopedProviderLabel}
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
          <div className="p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-input px-2">
              <input
                value={customValue}
                onChange={(event) => setCustomValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCustomSubmit();
                  if (event.key === 'Escape') setCustomMode(false);
                }}
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
            <div className="flex items-center gap-2 border-b border-border/30 px-3">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search models…"
                className="h-8 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
                autoFocus
              />
            </div>

            <div className="max-h-[280px] overflow-y-auto py-1">
              {totalModels === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {filter ? 'No models match' : 'No models available'}
                </p>
              ) : (
                groups.map((group, index) => (
                  <div key={group.provider}>
                    {index > 0 && <div className="mx-3 my-0.5 border-t border-border/20" />}
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
                          isSelected={
                            value?.providerId === model.provider && value?.modelId === model.modelId
                          }
                          onSelect={() => handleSelect({
                            providerId: model.provider,
                            modelId: model.modelId,
                          })}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {providerFilter && (
              <div className="border-t border-border/30">
                <button
                  onClick={() => setCustomMode(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  Custom model ID…
                </button>
              </div>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ModelItem({
  model,
  isSelected,
  onSelect,
}: {
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
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
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
