/**
 * The shared model picker: one combobox.
 *
 * Type to filter by provider, model name or model id. Arrow keys move,
 * Enter picks, Escape closes. Every row names the model and its provider,
 * and the closed field does too. A caller may put fixed choices before the
 * models - a Workflow step's `Auto` and tiers, or a tier table's inherited
 * selection - with `leadingOptions`; the same query filters both.
 */

import { useCallback, useMemo } from 'react';
import {
  type SharedAvailableModelGroup,
  type SharedModelInfo,
} from '@sero-ai/common';
import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from '../ui/combobox';
import { InputGroupAddon, InputGroupButton } from '../ui/input-group';
import { cn } from '../../lib/utils';
import {
  buildModelPickerOptions,
  matchesModelPickerQuery,
  type ModelPickerLeadingOption,
  type ModelPickerOption,
} from './model-picker-options';

export type { ModelPickerLeadingOption } from './model-picker-options';

interface AvailableModelPickerProps<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
> {
  groups: TGroup[];
  value: string;
  onChange: (value: string) => void;
  /** Fixed choices listed before the models, such as Auto or the tiers. */
  leadingOptions?: ReadonlyArray<ModelPickerLeadingOption>;
  /** Shown when nothing is chosen. */
  placeholder?: string;
  /** Alias for `placeholder`; the field is both the choice and the search box. */
  searchPlaceholder?: string;
  /** Shown when a query matches nothing. */
  emptyLabel?: string;
  /** Shown when no models are available at all. */
  noModelsLabel?: string;
  /** The field's accessible name. */
  ariaLabel?: string;
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
  leadingOptions,
  placeholder = 'Choose a model',
  searchPlaceholder,
  emptyLabel = 'No matching models',
  noModelsLabel = 'No models available',
  ariaLabel,
  allowClear = false,
  disabled = false,
  className,
}: AvailableModelPickerProps<TModel, TGroup>) {
  const options = useMemo(
    () => buildModelPickerOptions(groups, leadingOptions, value),
    [groups, leadingOptions, value],
  );

  // The closed field shows the saved model even when it names a leading
  // option's value, so the value resolves against the list first.
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const filter = useCallback(
    (option: ModelPickerOption, query: string) => matchesModelPickerQuery(option, query),
    [],
  );

  const handleValueChange = useCallback(
    (option: ModelPickerOption | null) => onChange(option ? option.value : ''),
    [onChange],
  );

  return (
    <Combobox
      items={options}
      value={selectedOption}
      onValueChange={handleValueChange}
      isItemEqualToValue={(option: ModelPickerOption, current: ModelPickerOption) =>
        option.value === current.value
      }
      itemToStringLabel={(option: ModelPickerOption) => option.label}
      filter={filter}
      inline={false}
    >
      <ComboboxInput
        className={cn('w-full', className)}
        placeholder={searchPlaceholder ?? placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        showTrigger={false}
        showClear={false}
      >
        <InputGroupAddon align="inline-end">
          {selectedOption?.provider ? (
            <span className="pointer-events-none max-w-[8rem] truncate text-sm text-muted-foreground">
              {selectedOption.provider}
            </span>
          ) : null}
          {allowClear && value ? <ComboboxClear disabled={disabled} /> : null}
          <InputGroupButton size="icon-xs" variant="ghost" asChild disabled={disabled}>
            <ComboboxTrigger aria-label={ariaLabel ? `Open ${ariaLabel}` : 'Open model list'} />
          </InputGroupButton>
        </InputGroupAddon>
      </ComboboxInput>

      <ComboboxContent>
        <ComboboxEmpty>{groups.length === 0 ? noModelsLabel : emptyLabel}</ComboboxEmpty>
        <ComboboxList>
          {(option: ModelPickerOption) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.provider ? (
                <span className="shrink-0 text-xs text-muted-foreground">{option.provider}</span>
              ) : null}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
