/**
 * ModelPicker, dropdown for selecting a model from available providers.
 *
 * Uses @sero-ai/app-runtime's useAvailableModels() to fetch session-independent
 * model listings from the host's ModelRegistry. The selected value is stored
 * as a "provider/modelId" string matching the `pi --model` flag format.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Check, Settings2, Sparkles, X } from 'lucide-react';
import {
  useAvailableModels,
  type AppModelInfo,
  type AppModelGroup,
} from '@sero-ai/app-runtime';
import { SearchInput } from '@sero-ai/ui/components/ui/search-input';
import { cn } from '@sero-ai/ui/lib/utils';

// ── Types ────────────────────────────────────────────────────────

interface ModelPickerProps {
  /** Current model string (e.g. "anthropic/claude-sonnet-4-20250514"). */
  value: string;
  /** Called with the new model string, or empty string for "default". */
  onChange: (value: string) => void;
  /** CSS class override for the outer container. */
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────────

/** Convert a ModelInfo to the pi --model string format. */
function toModelString(model: AppModelInfo): string {
  return `${model.provider}/${model.modelId}`;
}

/** Find a model across all groups matching a value string. */
function findModel(
  groups: AppModelGroup[],
  value: string,
): { model: AppModelInfo; group: AppModelGroup } | null {
  for (const group of groups) {
    for (const model of group.models) {
      if (toModelString(model) === value) return { model, group };
      // Also match on just modelId for backwards compat
      if (model.modelId === value) return { model, group };
    }
  }
  return null;
}

/** Filter groups by query, matching on name or modelId. */
function filterGroups(groups: AppModelGroup[], query: string): AppModelGroup[] {
  if (!query) return groups;
  const q = query.toLowerCase();
  const filtered: AppModelGroup[] = [];
  for (const group of groups) {
    const matches = group.models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.modelId.toLowerCase().includes(q),
    );
    if (matches.length) filtered.push({ ...group, models: matches });
  }
  return filtered;
}

// ── Component ────────────────────────────────────────────────────

export function ModelPicker({ value, onChange, className }: ModelPickerProps) {
  const { groups, loading, error } = useAvailableModels();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve current selection
  const resolved = useMemo(() => findModel(groups, value), [groups, value]);

  // Filtered groups for search
  const filtered = useMemo(() => filterGroups(groups, filter), [groups, filter]);
  const totalFiltered = useMemo(
    () => filtered.reduce((n, g) => n + g.models.length, 0),
    [filtered],
  );

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      setFilter('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleSelect = useCallback(
    (model: AppModelInfo) => {
      onChange(toModelString(model));
      setOpen(false);
    },
    [onChange],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors',
          'hover:bg-secondary/50 focus:outline-none focus:ring-1 focus:ring-ring',
          open && 'ring-1 ring-ring',
        )}
      >
        {resolved ? (
          <>
            <img
              src={resolved.group.logo}
              alt={resolved.group.displayName}
              className="size-4 rounded-sm dark:invert"
            />
            <span className="flex-1 truncate text-left font-medium">
              {resolved.model.name}
            </span>
            {resolved.model.reasoning && (
              <Sparkles className="size-3 text-amber-500" />
            )}
          </>
        ) : value ? (
          <span className="flex-1 truncate text-left font-mono text-muted-foreground">
            {value}
          </span>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">
            Default model
          </span>
        )}

        {/* Clear / chevron */}
        {value ? (
          <button
            type="button"
            onClick={handleClear}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground"
            title="Reset to default"
          >
            <X className="size-3" />
          </button>
        ) : (
          <svg className="size-3 text-muted-foreground" viewBox="0 0 12 12" fill="none">
            <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Dropdown, opens upward to avoid overflowing the dialog */}
      {open && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-border bg-background shadow-lg">
          {/* Search */}
          <SearchInput
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search models…"
            containerClassName="border-b border-border py-1"
            className="h-7"
          />

          {/* Model list */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {loading ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                Loading models…
              </div>
            ) : error ? (
              <div className="px-3 py-4 text-center text-xs text-destructive">
                {error}
              </div>
            ) : groups.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No models available. Run <code className="rounded bg-muted px-1 font-mono">pi auth</code> to add a provider.
              </div>
            ) : totalFiltered === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No models matching "{filter}"
              </div>
            ) : (
              filtered.map((group, i) => (
                <ProviderGroup
                  key={group.provider}
                  group={group}
                  selectedValue={value}
                  onSelect={handleSelect}
                  showDivider={i > 0}
                />
              ))
            )}
          </div>

          {/* Default option */}
          <div className="border-t border-border p-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                !value
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              <Settings2 className="size-4" />
              <span className="font-medium">Use default model</span>
              {!value && <Check className="ml-auto size-3.5 text-emerald-500" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function ProviderGroup({
  group,
  selectedValue,
  onSelect,
  showDivider,
}: {
  group: AppModelGroup;
  selectedValue: string;
  onSelect: (model: AppModelInfo) => void;
  showDivider: boolean;
}) {
  return (
    <div>
      {showDivider && <div className="mx-3 border-t border-border" />}
      <div className="flex items-center gap-2 px-3 pb-0.5 pt-2">
        <img
          src={group.logo}
          alt={group.displayName}
          className="size-3.5 rounded-sm dark:invert"
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {group.displayName}
        </span>
      </div>
      <div className="px-1">
        {group.models.map((model) => {
          const modelStr = toModelString(model);
          const isSelected = selectedValue === modelStr || selectedValue === model.modelId;
          return (
            <button
              key={modelStr}
              type="button"
              onClick={() => onSelect(model)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                isSelected
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
              )}
            >
              <span className="size-3.5 text-center text-[11px]">
                {isSelected ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <span className="inline-block size-1.5 rounded-full bg-border" />
                )}
              </span>
              <span className="flex-1 truncate font-medium">{model.name}</span>
              {model.reasoning && (
                <Sparkles className="size-3 text-amber-500/60" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ModelPicker;
