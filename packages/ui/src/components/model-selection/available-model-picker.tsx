/**
 * A model picker shaped as a settings field.
 *
 * The trigger is a full-width box that names the current model. The list
 * itself is `ModelPickerBody`, so a composer can show the same list under
 * a compact chip instead. Thinking is a separate control here: a settings
 * card keeps it visible beside the model rather than behind a click.
 */

import { useCallback, useMemo, useState } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import {
  findGroup,
  findModel,
  parseModelKey,
  type SharedAvailableModelGroup,
  type SharedModelInfo,
} from '@sero-ai/common';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ModelPickerBody, ProviderLogo } from './model-picker-body';
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
  searchPlaceholder = 'Search models...',
  emptyLabel = 'No matching models',
  noModelsLabel = 'No models available',
  allowClear = false,
  disabled = false,
  className,
}: AvailableModelPickerProps<TModel, TGroup>) {
  const [open, setOpen] = useState(false);

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

  const handleSelect = useCallback((nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
  }, [onChange]);

  const handleClear = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onChange('');
    setOpen(false);
  }, [onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-base transition-colors',
            'hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            disabled && 'cursor-not-allowed opacity-50',
            className,
          )}
        >
          {selected.group && selected.model ? (
            <>
              <ProviderLogo
                logo={selected.group.logo}
                displayName={selected.group.displayName}
                className="size-4"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium text-foreground">{selected.model.name}</span>
                  {selected.model.reasoning ? (
                    <Sparkles className="size-3 shrink-0 text-amber-500/70" />
                  ) : null}
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {selected.group.displayName}
                </div>
              </div>
            </>
          ) : selected.fallbackLabel ? (
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
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
        <ModelPickerBody
          groups={groups}
          value={value}
          onChange={handleSelect}
          searchPlaceholder={searchPlaceholder}
          emptyLabel={emptyLabel}
          noModelsLabel={noModelsLabel}
        />
      </PopoverContent>
    </Popover>
  );
}
