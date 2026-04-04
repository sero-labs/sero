/**
 * TierPicker — onboarding step for picking default models per tier.
 *
 * Uses popover-based model pickers with search and provider grouping,
 * matching the look/feel of the main ModelSelector. Includes a "use same
 * for all" toggle and a skip button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@sero-ai/ui/components/ui/popover';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { Label } from '@sero-ai/ui/components/ui/label';
import type { ModelTierSettings, ModelTierEntry, AvailableModelGroup, ModelInfo } from '@/types/ipc';

interface TierPickerProps {
  onComplete: (tiers: ModelTierSettings) => void;
  onSkip: () => void;
}

const TIER_META = [
  { key: 'LOW' as const, label: 'Low', desc: 'Fast, cheap tasks' },
  { key: 'MED' as const, label: 'Medium', desc: 'Everyday agents' },
  { key: 'HIGH' as const, label: 'High', desc: 'Complex reasoning' },
] as const;

function mkKey(provider: string, modelId: string): string {
  return `${provider}/${modelId}`;
}

function parseModelKey(key: string): ModelTierEntry | null {
  const idx = key.indexOf('/');
  if (idx === -1) return null;
  return { provider: key.slice(0, idx), modelId: key.slice(idx + 1) };
}

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

// ── Popover-based Model Picker ──────────────────────────────

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

  const filtered = useMemo(() => filterGroups(groups, filter), [groups, filter]);

  const selectedModel = useMemo(() => {
    if (!selectedKey) return null;
    for (const g of groups) {
      const m = g.models.find((model) => mkKey(model.provider, model.modelId) === selectedKey);
      if (m) return { model: m, group: g };
    }
    return null;
  }, [groups, selectedKey]);

  const handleSelect = useCallback((model: ModelInfo) => {
    onSelect(mkKey(model.provider, model.modelId));
    setOpen(false);
  }, [onSelect]);

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      setFilter('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setOpen(next);
  }, []);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className="flex w-full items-center justify-between rounded-md border border-[var(--border-default)]
            bg-[var(--bg-base)] px-3 py-2 text-xs transition-colors
            hover:border-[var(--border-hover)] hover:bg-[var(--bg-elevated)]"
        >
          {selectedModel ? (
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={selectedModel.group.logo}
                alt={selectedModel.group.displayName}
                className="size-3.5 rounded-sm shrink-0 dark:invert"
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
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3">
          <Search className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search models…"
            className="h-8 w-full bg-transparent text-xs text-[var(--text-primary)]
              placeholder:text-[var(--text-muted)] outline-none"
          />
        </div>

        {/* Model list — overscroll-contain fixes trackpad scrolling inside Radix popovers */}
        <div className="max-h-[240px] overflow-y-auto overscroll-contain py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-[var(--text-muted)]">
              No models matching &ldquo;{filter}&rdquo;
            </div>
          ) : (
            filtered.map((group, i) => (
              <div key={group.provider}>
                {i > 0 && <div className="mx-3 border-t border-[var(--border-subtle)]" />}
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
                      const key = mkKey(model.provider, model.modelId);
                      const isSelected = key === selectedKey;
                      return (
                        <button
                          key={key}
                          onClick={() => handleSelect(model)}
                          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5
                            text-left text-xs transition-colors duration-100 ${
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

// ── Main Component ──────────────────────────────────────────

export function TierPicker({ onComplete, onSkip }: TierPickerProps) {
  const [groups, setGroups] = useState<AvailableModelGroup[]>([]);
  const [sameForAll, setSameForAll] = useState(false);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Load available models via session-independent IPC
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await window.sero.models.list();
        if (!cancelled) setGroups(result);
      } catch {
        // No models available
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSelect = useCallback((tier: string, value: string) => {
    setSelections((prev) => {
      if (sameForAll) return { LOW: value, MED: value, HIGH: value };
      return { ...prev, [tier]: value };
    });
  }, [sameForAll]);

  const handleSameToggle = useCallback((checked: boolean) => {
    setSameForAll(checked);
    if (checked) {
      setSelections((prev) => {
        const first = prev.LOW || prev.MED || prev.HIGH || '';
        return { LOW: first, MED: first, HIGH: first };
      });
    }
  }, []);

  const handleComplete = useCallback(() => {
    const tiers: ModelTierSettings = {};
    for (const { key } of TIER_META) {
      const val = selections[key];
      if (val) {
        const parsed = parseModelKey(val);
        if (parsed) tiers[key] = parsed;
      }
    }
    onComplete(tiers);
  }, [selections, onComplete]);

  const hasAnySelection = Object.values(selections).some(Boolean);
  const totalModels = groups.reduce((n, g) => n + g.models.length, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        Loading available models...
      </div>
    );
  }

  if (totalModels === 0) {
    return (
      <div className="space-y-3 text-center py-4">
        <p className="text-sm text-muted-foreground">
          No models available. Sign in to a provider first.
        </p>
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch
          id="same-for-all"
          checked={sameForAll}
          onCheckedChange={handleSameToggle}
        />
        <Label htmlFor="same-for-all" className="text-xs text-muted-foreground">
          Use the same model for all tiers
        </Label>
      </div>

      <div className="space-y-3">
        {(sameForAll ? [TIER_META[0]] : TIER_META).map(({ key, label, desc }) => (
          <div key={key} className="space-y-1.5">
            <div>
              <Label className="text-sm font-medium">
                {sameForAll ? 'All tiers' : label}
              </Label>
              <p className="text-xs text-muted-foreground">
                {sameForAll ? 'Single model for all task types' : desc}
              </p>
            </div>
            <ModelPickerPopover
              groups={groups}
              selectedKey={selections[key] || ''}
              onSelect={(v) => handleSelect(key, v)}
              placeholder="Choose a model…"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip
        </Button>
        <Button size="sm" onClick={handleComplete} disabled={!hasAnySelection}>
          Continue
        </Button>
      </div>
    </div>
  );
}
