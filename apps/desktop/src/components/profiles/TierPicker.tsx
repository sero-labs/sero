/**
 * TierPicker — advanced onboarding editor for LOW/MED/HIGH model tiers.
 *
 * Prefills the current recommendation, supports a same-model-for-all toggle,
 * and only surfaces providers that currently have usable models.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Label } from '@sero-ai/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import type {
  AvailableModelGroup,
  ModelInfo,
  ModelTierEntry,
  ModelTierSettings,
  ProviderHealthInfo,
} from '@/types/ipc';
import { modelKey, parseModelKey } from '@/lib/model-keys';

interface TierPickerProps {
  groups: AvailableModelGroup[];
  providerHealth: ProviderHealthInfo[];
  initialTiers: ModelTierSettings;
  onSave: (tiers: ModelTierSettings) => void;
  onBack: () => void;
}

const TIER_META = [
  { key: 'LOW' as const, label: 'Low', desc: 'Fast, inexpensive work' },
  { key: 'MED' as const, label: 'Medium', desc: 'General-purpose agents' },
  { key: 'HIGH' as const, label: 'High', desc: 'Deep reasoning and complex work' },
] as const;

type TierKey = (typeof TIER_META)[number]['key'];
type SelectionState = Record<TierKey, string>;

function createSelectionState(tiers: ModelTierSettings): SelectionState {
  return {
    LOW: tiers.LOW ? modelKey(tiers.LOW.provider, tiers.LOW.modelId) : '',
    MED: tiers.MED ? modelKey(tiers.MED.provider, tiers.MED.modelId) : '',
    HIGH: tiers.HIGH ? modelKey(tiers.HIGH.provider, tiers.HIGH.modelId) : '',
  };
}

function areSelectionsUniform(selections: SelectionState): boolean {
  const values = [selections.LOW, selections.MED, selections.HIGH].filter(Boolean);
  return values.length === 3 && new Set(values).size === 1;
}

function filterGroups(groups: AvailableModelGroup[], query: string): AvailableModelGroup[] {
  if (!query.trim()) return groups;
  const lowerQuery = query.trim().toLowerCase();

  return groups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) =>
        model.name.toLowerCase().includes(lowerQuery)
        || model.modelId.toLowerCase().includes(lowerQuery),
      ),
    }))
    .filter((group) => group.models.length > 0);
}

function hiddenBrokenProviders(providerHealth: ProviderHealthInfo[]): string[] {
  return providerHealth
    .filter((provider) => !provider.hasUsableModels && (provider.status === 'broken_expired' || provider.status === 'broken_invalid'))
    .map((provider) => provider.displayName)
    .sort((a, b) => a.localeCompare(b));
}

function ModelPickerPopover({
  groups,
  selectedKey,
  onSelect,
  placeholder,
}: {
  groups: AvailableModelGroup[];
  selectedKey: string;
  onSelect: (key: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredGroups = useMemo(() => filterGroups(groups, filter), [groups, filter]);

  const selectedModel = useMemo(() => {
    if (!selectedKey) return null;
    for (const group of groups) {
      const model = group.models.find((entry) => modelKey(entry.provider, entry.modelId) === selectedKey);
      if (model) return { group, model };
    }
    return null;
  }, [groups, selectedKey]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFilter('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setOpen(nextOpen);
  }, []);

  const handleSelect = useCallback((model: ModelInfo) => {
    onSelect(modelKey(model.provider, model.modelId));
    setOpen(false);
  }, [onSelect]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex w-full items-center justify-between rounded-md border border-[var(--border-default)]
            bg-[var(--bg-base)] px-3 py-2 text-xs transition-colors
            hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]"
        >
          {selectedModel ? (
            <div className="flex min-w-0 items-center gap-2">
              <img
                src={selectedModel.group.logo}
                alt={selectedModel.group.displayName}
                className="size-3.5 shrink-0 rounded-sm dark:invert"
              />
              <span className="truncate font-medium text-[var(--text-primary)]">
                {selectedModel.model.name}
              </span>
            </div>
          ) : (
            <span className="text-[var(--text-muted)]">{placeholder}</span>
          )}
          <ChevronDown className="size-3 shrink-0 text-[var(--text-muted)]" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl
          border-[var(--border-subtle)] bg-[var(--bg-surface)] p-0 shadow-2xl shadow-black/40"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search models…"
            className="h-8 w-full bg-transparent text-xs text-[var(--text-primary)]
              placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>

        <div className="max-h-[240px] overflow-y-auto overscroll-contain py-1">
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-[var(--text-muted)]">
              No models match “{filter}”
            </div>
          ) : (
            filteredGroups.map((group, groupIndex) => (
              <div key={group.provider}>
                {groupIndex > 0 ? <div className="mx-3 border-t border-[var(--border-subtle)]" /> : null}
                <div className="py-1">
                  <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                    <img
                      src={group.logo}
                      alt={group.displayName}
                      className="size-3.5 rounded-sm dark:invert"
                    />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      {group.displayName}
                    </span>
                  </div>
                  <div className="px-1">
                    {group.models.map((model) => {
                      const key = modelKey(model.provider, model.modelId);
                      const isSelected = key === selectedKey;
                      return (
                        <button
                          key={key}
                          onClick={() => handleSelect(model)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors duration-100 ${
                            isSelected
                              ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/60 hover:text-[var(--text-primary)]'
                          }`}
                        >
                          <div className="flex size-4 shrink-0 items-center justify-center">
                            {isSelected ? (
                              <Check className="size-3.5 text-[var(--status-success)]" />
                            ) : (
                              <div className="size-1.5 rounded-full bg-[var(--border-default)]" />
                            )}
                          </div>
                          <span className="truncate font-medium">{model.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TierPicker({
  groups,
  providerHealth,
  initialTiers,
  onSave,
  onBack,
}: TierPickerProps) {
  const usableGroups = useMemo(
    () => groups.filter((group) => group.models.length > 0),
    [groups],
  );
  const brokenProviders = useMemo(
    () => hiddenBrokenProviders(providerHealth),
    [providerHealth],
  );

  const initialSelections = useMemo(() => createSelectionState(initialTiers), [initialTiers]);
  const [sameForAll, setSameForAll] = useState(areSelectionsUniform(initialSelections));
  const [selections, setSelections] = useState<SelectionState>(initialSelections);

  const handleSelect = useCallback((tier: TierKey, value: string) => {
    setSelections((current) => {
      if (sameForAll) {
        return { LOW: value, MED: value, HIGH: value };
      }
      return { ...current, [tier]: value };
    });
  }, [sameForAll]);

  const handleSameToggle = useCallback((checked: boolean) => {
    setSameForAll(checked);
    if (!checked) return;

    setSelections((current) => {
      const sharedValue = current.LOW || current.MED || current.HIGH || '';
      return { LOW: sharedValue, MED: sharedValue, HIGH: sharedValue };
    });
  }, []);

  const allSelectionsFilled = sameForAll
    ? Boolean(selections.LOW || selections.MED || selections.HIGH)
    : TIER_META.every(({ key }) => Boolean(selections[key]));

  const handleSave = useCallback(() => {
    const nextTiers: ModelTierSettings = {};
    for (const { key } of TIER_META) {
      const rawValue = sameForAll ? (selections.LOW || selections.MED || selections.HIGH) : selections[key];
      const entry = rawValue ? parseModelKey(rawValue) : null;
      if (entry) nextTiers[key] = entry;
    }
    onSave(nextTiers);
  }, [onSave, sameForAll, selections]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">Customize your model tiers</p>
        <p className="text-xs text-[var(--text-secondary)]">
          These defaults stay tied to this profile. You can change them again later.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="same-for-all" checked={sameForAll} onCheckedChange={handleSameToggle} />
        <Label htmlFor="same-for-all" className="text-xs text-[var(--text-secondary)]">
          Use the same model for all tiers
        </Label>
      </div>

      {brokenProviders.length > 0 ? (
        <div className="rounded-md border border-[var(--status-warning)]/20 bg-[var(--status-warning)]/5 px-3 py-2 text-xs text-[var(--text-secondary)]">
          Hidden for now: {brokenProviders.join(', ')} need to be reconnected before their models can be used.
        </div>
      ) : null}

      <div className="space-y-3">
        {(sameForAll ? [TIER_META[0]] : TIER_META).map(({ key, label, desc }) => (
          <div key={key} className="space-y-1.5">
            <div>
              <Label className="text-sm font-medium text-[var(--text-primary)]">
                {sameForAll ? 'All tiers' : label}
              </Label>
              <p className="text-xs text-[var(--text-secondary)]">
                {sameForAll ? 'One model for every task complexity.' : desc}
              </p>
            </div>
            <ModelPickerPopover
              groups={usableGroups}
              selectedKey={selections[key]}
              onSelect={(value) => handleSelect(key, value)}
              placeholder="Choose a model…"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button size="sm" onClick={handleSave} disabled={!allSelectionsFilled}>
          Save model tiers
        </Button>
      </div>
    </div>
  );
}
