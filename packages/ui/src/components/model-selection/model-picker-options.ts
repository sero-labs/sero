/**
 * The model picker's list, as plain data.
 *
 * Kept apart from the control so the filter rule can be tested without
 * opening a popup. `matchesModelPickerQuery` matches the same string
 * `filterModelGroups` (`@sero-ai/common`) matches: the provider's display
 * name, the model's name and its id.
 */

import { modelKey, type SharedAvailableModelGroup, type SharedModelInfo } from '@sero-ai/common';

export interface ModelPickerOption {
  /** What the caller saves: a model key, or a leading option's value. */
  value: string;
  label: string;
  /** The provider's display name. Empty for a leading option. */
  provider: string;
}

export interface ModelPickerLeadingOption {
  value: string;
  label: string;
}

/**
 * The options in display order: the caller's fixed choices first, then every
 * model under its provider. A saved value the catalogue does not hold is
 * appended, so a removed model stays visible rather than silently blank.
 */
export function buildModelPickerOptions<
  TModel extends SharedModelInfo,
  TGroup extends SharedAvailableModelGroup<TModel>,
>(
  groups: TGroup[],
  leadingOptions: ReadonlyArray<ModelPickerLeadingOption> | undefined,
  savedValue = '',
): ModelPickerOption[] {
  const options: ModelPickerOption[] = [
    ...(leadingOptions ?? []).map((option) => ({
      value: option.value,
      label: option.label,
      provider: '',
    })),
    ...groups.flatMap((group) =>
      group.models.map((model) => ({
        value: modelKey(model.provider, model.modelId),
        label: model.name,
        provider: group.displayName,
      })),
    ),
  ];

  if (savedValue && !options.some((option) => option.value === savedValue)) {
    options.push({ value: savedValue, label: savedValue, provider: '' });
  }

  return options;
}

/** The filter rule: provider, then name, then id, case-insensitive. */
export function matchesModelPickerQuery(option: ModelPickerOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${option.provider} ${option.label} ${option.value}`.toLowerCase().includes(normalized);
}
