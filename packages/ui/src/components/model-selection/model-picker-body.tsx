/**
 * The model list itself: a search field, provider groups, and model rows.
 *
 * This holds no popover and no trigger, so a caller decides how it is
 * shown. `AvailableModelPicker` wraps it in a full-width settings field.
 * A chat composer wraps it in a compact chip and adds a thinking control
 * below it, inside the same popover.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  filterModelGroups,
  modelKey,
  type SharedAvailableModelGroup,
  type SharedModelInfo,
} from '@sero-ai/common';
import { SearchInput } from '../ui/search-input';
import { cn } from '../../lib/utils';

/**
 * A provider logo.
 *
 * `logo` is a remote URL, so it is empty for some providers and it fails
 * on a machine with no internet. Either way we show nothing rather than
 * a broken image.
 */
export function ProviderLogo({
  logo,
  displayName,
  className,
}: {
  logo: string;
  displayName: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A new provider deserves a fresh attempt.
  useEffect(() => setFailed(false), [logo]);

  if (!logo || failed) return null;

  return (
    <img
      src={logo}
      alt={displayName}
      onError={() => setFailed(true)}
      className={cn('size-3.5 shrink-0 rounded-sm dark:invert', className)}
    />
  );
}

interface ModelPickerBodyProps<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
> {
  groups: TGroup[];
  /** The selected model as `provider/modelId`, or '' for none. */
  value: string;
  /** Called with the new `provider/modelId`. */
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
  noModelsLabel?: string;
  /**
   * Focus the search field on mount. Turn this off on a phone: the
   * on-screen keyboard would cover the list the user came to read.
   */
  autoFocusSearch?: boolean;
  /** Hide provider logos where the network may not reach them. */
  showProviderLogos?: boolean;
  /** Shown at the right of the search field, such as a settings button. */
  searchEndAdornment?: ReactNode;
  className?: string;
  /** Applied to the scrolling list, so a caller sets its height. */
  listClassName?: string;
}

export function ModelPickerBody<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>({
  groups,
  value,
  onChange,
  searchPlaceholder = 'Search models...',
  emptyLabel = 'No matching models',
  noModelsLabel = 'No models available',
  autoFocusSearch = true,
  showProviderLogos = true,
  searchEndAdornment,
  className,
  listClassName,
}: ModelPickerBodyProps<TModel, TGroup>) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // The body mounts when its popover opens, so focusing on mount is
  // enough; the query starts empty for the same reason.
  useEffect(() => {
    if (!autoFocusSearch) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocusSearch]);

  const filteredGroups = useMemo(() => filterModelGroups(groups, query), [groups, query]);

  const totalResults = useMemo(
    () => filteredGroups.reduce((count, group) => count + group.models.length, 0),
    [filteredGroups],
  );

  const handleSelect = useCallback(
    (provider: string, modelId: string) => {
      onChange(modelKey(provider, modelId));
      setQuery('');
    },
    [onChange],
  );

  return (
    <div className={className}>
      <SearchInput
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        data-slot="model-filter"
        containerClassName="border-b border-border/40"
        endAdornment={searchEndAdornment}
      />

      <div className={cn('max-h-[280px] overflow-y-auto py-1', listClassName)}>
        {groups.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">{noModelsLabel}</div>
        ) : totalResults === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyLabel}</div>
        ) : (
          filteredGroups.map((group, index) => (
            <div key={group.provider}>
              {index > 0 ? <div className="mx-3 border-t border-border/30" /> : null}
              <div className="flex items-center gap-2 px-3 pb-1 pt-2">
                {showProviderLogos ? (
                  <ProviderLogo logo={group.logo} displayName={group.displayName} />
                ) : null}
                <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
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
    </div>
  );
}
