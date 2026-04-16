import { useCallback, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Sparkles, X } from 'lucide-react';
import {
  filterModelGroups,
  findGroup,
  findModel,
  modelKey,
  parseModelKey,
  type SharedAvailableModelGroup,
  type SharedModelInfo,
} from '@sero/common';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { SearchInput } from '../ui/search-input';
import { cn } from '../../lib/utils';

interface AvailableModelPickerProps<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
> {
  groups: TGroup[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  noModelsLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AvailableModelPicker<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>({
  groups,
  value,
  onChange,
  placeholder = 'Choose a model',
  searchPlaceholder = 'Search models…',
  emptyLabel = 'No matching models',
  noModelsLabel = 'No models available',
  allowClear = false,
  disabled = false,
  className,
}: AvailableModelPickerProps<TModel, TGroup>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => {
    const parsed = parseModelKey(value);
    if (!parsed) {
      return value
        ? { group: null, model: null, fallbackLabel: value }
        : { group: null, model: null, fallbackLabel: null };
    }

    const group = findGroup(groups, parsed.provider, parsed.modelId) ?? null;
    const model = findModel(groups, parsed.provider, parsed.modelId) ?? null;
    return {
      group,
      model,
      fallbackLabel: model ? null : value,
    };
  }, [groups, value]);

  const filteredGroups = useMemo(
    () => filterModelGroups(groups, query),
    [groups, query],
  );

  const totalResults = useMemo(
    () => filteredGroups.reduce((count, group) => count + group.models.length, 0),
    [filteredGroups],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    setQuery('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleSelect = useCallback((provider: string, modelId: string) => {
    onChange(modelKey(provider, modelId));
    setOpen(false);
    setQuery('');
  }, [onChange]);

  const handleClear = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-colors',
            'hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          {selected.group && selected.model ? (
            <>
              <img
                src={selected.group.logo}
                alt={selected.group.displayName}
                className="size-4 shrink-0 rounded-sm dark:invert"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{selected.model.name}</span>
                  {selected.model.reasoning ? (
                    <Sparkles className="size-3 shrink-0 text-amber-500/70" />
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {selected.group.displayName}
                </div>
              </div>
            </>
          ) : selected.fallbackLabel ? (
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {selected.fallbackLabel}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {placeholder}
            </span>
          )}

          {allowClear && value ? (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Clear selection"
            >
              <X className="size-3.5" />
            </button>
          ) : null}

          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </div>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl border-border/60 bg-background p-0 shadow-xl"
        onWheel={(event) => event.stopPropagation()}
      >
        <SearchInput
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          containerClassName="border-b border-border/40"
        />

        <div className="max-h-[280px] overflow-y-auto py-1">
          {groups.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {noModelsLabel}
            </div>
          ) : totalResults === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {emptyLabel}
            </div>
          ) : (
            filteredGroups.map((group, index) => (
              <div key={group.provider}>
                {index > 0 ? <div className="mx-3 border-t border-border/30" /> : null}
                <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                  <img
                    src={group.logo}
                    alt={group.displayName}
                    className="size-3.5 shrink-0 rounded-sm dark:invert"
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.displayName}
                  </span>
                </div>
                <div className="px-1">
                  {group.models.map((model) => {
                    const nextValue = modelKey(model.provider, model.modelId);
                    const isSelected = nextValue === value;
                    return (
                      <button
                        key={nextValue}
                        type="button"
                        onClick={() => handleSelect(model.provider, model.modelId)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
                          isSelected
                            ? 'bg-secondary text-foreground'
                            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                        )}
                      >
                        <div className="flex size-4 shrink-0 items-center justify-center">
                          {isSelected ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <div className="size-1.5 rounded-full bg-border" />
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate font-medium">{model.name}</span>
                        {model.reasoning ? (
                          <Sparkles className="size-3 shrink-0 text-amber-500/60" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
